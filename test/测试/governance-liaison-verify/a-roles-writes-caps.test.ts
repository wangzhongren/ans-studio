// test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts
// 独立端到端验收（测试角色，2026-10-18；2026-10-19 客户 shell 新规则同步）：五角色枚举/主入口、
// 旧 trio 自动获得 Liaison、single 逐字不变、Liaison 写权矩阵、能力矩阵与工具注册面。
//
// 依据：`角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md`
// §4.1–§4.7、§十 AC1–AC4/AC14/AC16；客户 2026-10-19 新规则（所有角色都有 shell 权限，包括读写与
// 任何需要命令的权限，但一律提交审批、按原有流程审批）——五个内置治理角色均 `shell: "operator-approve"`。
// 全部离线（临时目录 + 自建假适配器），不读 `.env`、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { governanceCapabilitiesOf, governanceRoleOf } from "../../../src/common/门禁引擎/governance-roles.ts";
import { defaultShellRules } from "../../../src/common/门禁引擎/classify-shell.ts";
import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import { resolveGovernanceRole } from "../../../src/service/role/resolve-role.ts";
import {
  FIVE_ROLE_IDS,
  capture,
  consume,
  customerChannel,
  listOf,
  makeRoot,
  singleProject,
  snapshotTree,
  toolAdapterFactory,
  trioProject,
  write,
  writeProjectRole,
} from "./fixture.ts";

// —————————————————————— 1) 五角色枚举与主入口 ——————————————————————

test("五角色枚举：新空项目恰 5 个 builtIn（liaison→rapporteur→nominator→convener→verifier）、primary=liaison、governanceModel=trio", async () => {
  const { root, cleanup } = makeRoot("listing-five");
  try {
    const listing = await listOf(root);
    const builtIns = listing.roles.filter((r) => r.builtIn === true);
    assert.deepEqual(builtIns.map((r) => r.roleId), [...FIVE_ROLE_IDS], "恰 5 个内置、顺序固定");
    assert.deepEqual(
      builtIns.map((r) => r.governanceFunction),
      ["liaison", "proposal", "nomination", "schedule", "verification"],
      "职能与角色一一对应（含验收权 verification）",
    );
    assert.equal(listing.primaryRoleId, "liaison", "主入口 = Lead / 主理");
    assert.equal(listing.governanceModel, "trio", "治理模型仍叫 trio（三权 · 五角色）");
    assert.equal(listing.hasRoles, false);
    assert.equal(listing.roles.some((r) => r.roleId === "su"), false, "trio 下不枚举 su");
    assert.deepEqual(listing.warnings, [], "空项目是正常态：不报警");
    for (const r of builtIns) {
      assert.equal(r.cardPath, "", "内置角色没有角色目录");
      assert.equal(r.boundaryPath, "", "内置角色没有边界文件");
      assert.ok(r.cardText.length > 0, "内置卡文本由注册表合成");
      assert.equal(r.boundary.boundarySource, `<built-in:trio/${r.roleId}>`);
    }
    // 卡文本职责（四角色评审 §二-3）：Liaison 明确沟通权与非批准；Rapporteur 不再自称客户沟通主入口；
    // Convener 的提名步骤改为应用后台派发。
    const liaison = builtIns.find((r) => r.roleId === "liaison")!;
    assert.match(liaison.cardText, /客户沟通权/);
    assert.match(liaison.cardText, /不拥有最终批准权/);
    assert.match(liaison.cardText, /docs\/intents\//);
    assert.match(liaison.cardText, /hand_off_intent/);
    assert.match(liaison.cardText, /不得创建额外的治理角色/);
    // 2026-10-20 客户拍板：Lead / 主理 兼任**工作流管理者**——dispatchTask/flow 三工具用于协调
    // Steward 与项目角色，**不是客户批准**（派发/推进 ≠ 客户决定；不改变任何写边界）。
    assert.match(liaison.cardText, /工作流管理者/);
    assert.match(liaison.cardText, /dispatch_task/);
    assert.match(liaison.cardText, /flow_get.*flow_step_update.*flow_step_supersede/);
    assert.match(liaison.cardText, /派发\/推进 ≠ 客户批准/);
    assert.match(liaison.cardText, /不改变任何角色的写边界/);
    const rapporteur = builtIns.find((r) => r.roleId === "rapporteur")!;
    assert.match(rapporteur.cardText, /request_clarification/, "Rapporteur 有澄清通道");
    assert.doesNotMatch(rapporteur.cardText, /客户沟通主入口/, "Rapporteur 不再自称客户沟通主入口");
    const convener = builtIns.find((r) => r.roleId === "convener")!;
    assert.match(convener.cardText, /应用后台派发/, "Convener 的提名步骤由应用后台派发");
  } finally {
    cleanup();
  }
});

test("旧 trio 项目：自动获得 Liaison 主入口、零迁移（`.ans`/文件树逐字节不变）", async () => {
  const { root, cleanup } = makeRoot("old-trio");
  try {
    writeProjectRole(root, "A");
    write(root, ".ans/project.json", JSON.stringify({ projectRoot: root, roles: {}, governanceModel: "trio" }) + "\n");
    const before = snapshotTree(root);
    const listing = await listOf(root);
    assert.deepEqual(snapshotTree(root), before, "listProject 不得重写 `.ans`/角色卡/任何文件");
    assert.equal(listing.governanceModel, "trio");
    assert.equal(listing.primaryRoleId, "liaison", "旧 trio 项目升级后默认入口 = Liaison");
    assert.deepEqual(
      listing.roles.map((r) => r.roleId),
      ["liaison", "rapporteur", "nominator", "convener", "verifier", "A"],
      "五内置在前、项目角色保留",
    );
  } finally {
    cleanup();
  }
});

test("保留 id：`角色卡/liaison/` 被跳过并警告；项目角色不能遮蔽内置 Liaison", async () => {
  const { root, cleanup } = makeRoot("reserved-liaison");
  try {
    write(root, "角色卡/liaison/role-card.md", "# 假 Liaison\n");
    write(root, "角色卡/liaison/boundary.yaml", "entries:\n  - kind: directory\n    path: src/\n    purpose: t\n");
    write(root, ".ans/project.json", JSON.stringify({ governanceModel: "trio" }));
    const listing = await listOf(root);
    assert.equal(
      listing.roles.filter((r) => r.roleId === "liaison").length,
      1,
      "项目目录不得再枚举出第二个 liaison",
    );
    assert.equal(listing.roles.find((r) => r.roleId === "liaison")!.builtIn, true);
    assert.match(listing.warnings.join("\n"), /角色卡\/liaison：与内置治理角色 id 冲突，已跳过/);
  } finally {
    cleanup();
  }
});

// —————————————————————— 2) single 逐字不变 ——————————————————————

test("single：仍只返回 su、primary=su；无 Liaison/交接/镜像面；resolveGovernanceRole 拒绝 liaison", async () => {
  const { root, cleanup } = makeRoot("single-unchanged");
  try {
    writeProjectRole(root, "A");
    write(root, ".ans/project.json", JSON.stringify({ projectRoot: root, roles: {}, governanceModel: "single" }) + "\n");
    const listing = await listOf(root);
    assert.equal(listing.governanceModel, "single");
    assert.equal(listing.primaryRoleId, "su");
    assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "A"]);
    assert.equal(listing.roles.some((r) => r.roleId === "liaison"), false, "single 不出现 Liaison");
    assert.deepEqual(resolveGovernanceRole(listing), { roleId: "su", function: null, model: "single" });
    assert.throws(() => resolveGovernanceRole(listing, { roleId: "liaison" }), /旧治理模型/);

    // 能力面：su 旧行为不多给工具（注册表显式 false，不是缺省省略）。
    assert.deepEqual(governanceCapabilitiesOf("su"), {
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
  } finally {
    cleanup();
  }
});

// —————————————————————— 3) Liaison 写权矩阵（真实会话 gate） ——————————————————————

async function gateOf(root: string, roleId: string): Promise<(p: string) => { allowed: boolean; reason?: string }> {
  const cap = capture();
  const handle = await openRoleSession(
    { roleId, project: trioProject(root), taskId: "T-write" },
    { createAdapter: toolAdapterFactory(cap, { root }) },
  );
  await consume(handle, "（验收空脚本）");
  await handle.dispose();
  assert.ok(cap.gate, `${roleId} 应有 gate`);
  return cap.gate;
}

test("Liaison 写权：docs/intents/** 放行；角色卡//.ans//proposals/契约/提名/流程 等全拒且给原因", async () => {
  const { root, cleanup } = makeRoot("liaison-writes");
  try {
    writeProjectRole(root, "A");
    const gate = await gateOf(root, "liaison");
    for (const p of ["docs/intents/intent-a.md", "docs/intents/2026-10-18/sub/intent-b.md"]) {
      assert.equal(gate(p).allowed, true, `Liaison 应可写 ${p}`);
    }
    for (const p of [
      "角色卡/liaison/role-card.md",
      "角色卡/A/role-card.md",
      "角色卡/governance-boundary.yaml",
      ".ans/project.json",
      ".ans/governance/ledger.jsonl",
      "docs/bootstrap-manifest.md",
      "docs/proposals/flow-a-v1.md",
      "docs/contracts/c-v1.md",
      "docs/nominations/flow-a-v1.md",
      "docs/flows/flow-a.md",
      "docs/skills/s/SKILL.md",
      "docs/mcp/m.md",
      "docs/governance/liaison/notes.md",
      "docs/workflow.md",
      "src/x.ts",
    ]) {
      const d = gate(p);
      assert.equal(d.allowed, false, `Liaison 越界写入应拒：${p}`);
      assert.ok((d.reason ?? "").length > 0, `拒绝须给原因：${p}`);
    }
  } finally {
    cleanup();
  }
});

// —————————————————————— 3b) 拒绝文案归属（评审 AC3 口径） ——————————————————————

test("AC3 文案归属：越界写拒绝文案应指回正确归属（提案→报告员 / 提名→提名官 / 编排→召集人 / 应用）", async () => {
  const { root, cleanup } = makeRoot("liaison-write-hints");
  try {
    writeProjectRole(root, "A");
    const gate = await gateOf(root, "liaison");
    const cases: Array<[string, RegExp]> = [
      ["docs/proposals/flow-a-v1.md", /Rapporteur|报告员/],
      ["docs/contracts/c-v1.md", /Rapporteur|报告员/],
      ["docs/nominations/flow-a-v1.md", /Nominator|提名官/],
      ["docs/skills/s/SKILL.md", /Nominator|提名官/],
      ["docs/flows/flow-a.md", /Convener|召集人/],
      [".ans/project.json", /应用/],
      ["角色卡/A/role-card.md", /Nominator|提名官|应用/],
    ];
    for (const [path_, expected] of cases) {
      const d = gate(path_);
      assert.equal(d.allowed, false, `${path_} 应拒`);
      assert.match(d.reason ?? "", expected, `${path_} 的拒绝文案应指回正确归属，实得：${d.reason}`);
    }
  } finally {
    cleanup();
  }
});

// —————————————————————— 4) 能力矩阵（真实会话装配） ——————————————————————

test("能力矩阵：Liaison 客户通道（仅 intent-confirm）+ handOffIntent + 工作流管理（dispatchTask/flow 三工具）；Rapporteur 提案+澄清；Nominator 安装；Convener 派发/看护；五角色审批档 shell；Verifier 验收；su 不变", async () => {
  const { root, cleanup } = makeRoot("caps-five");
  try {
    writeProjectRole(root, "A");
    const project = trioProject(root);
    const captured = new Map<string, ReturnType<typeof capture>>();
    const operatorCalls = new Map<string, string[]>();
    const open = async (id: string): Promise<void> => {
      const cap = capture();
      captured.set(id, cap);
      const calls: string[] = [];
      operatorCalls.set(id, calls);
      const operator = async (prompt: { command: string }): Promise<{ outcome: "allow"; operatorId: string }> => {
        calls.push(prompt.command);
        return { outcome: "allow", operatorId: "op" };
      };
      const handle = await openRoleSession(
        {
          roleId: id,
          project,
          taskId: "T-cap",
          customerInput: customerChannel({ selected: [], confirmed: false }),
          handOffIntent: async () => ({ ok: true, message: "stub" }),
          requestClarification: async () => ({ ok: true, message: "stub" }),
          dispatchTask: async () => ({ ok: true, message: "stub" }),
          proposeRecovery: async () => null,
          roleStatus: async () => null,
          sessionTail: async () => null,
          installSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
          uninstallSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
          installMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
          uninstallMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
          // 客户 2026-10-19 新规则：五个内置治理角色均 `shell: "operator-approve"`——
          // 传审批档选项（含操作者通道）时应 arm 审批档；allow 直放、risky/review/deny 逐条审批。
          shellOperatorOnly: {
            classifyShell: (argv: string[]) => (argv[0] === "ls" ? ("allow" as const) : ("risky" as const)),
            rules: defaultShellRules(),
            operatorChannel: operator,
          },
        },
        { createAdapter: toolAdapterFactory(cap, { root }) },
      );
      await consume(handle, "（验收空脚本）");
      await handle.dispose();
    };
    for (const id of FIVE_ROLE_IDS) await open(id);

    // 五角色统一审批档（客户 2026-10-19）：均 arm；allow 0 卡直放；risky 逐条交审批、批准后放行。
    for (const id of FIVE_ROLE_IDS) {
      const caps = captured.get(id)!.caps!;
      assert.equal(typeof caps.shellGate, "function", `${id}（operator-approve）应 arm 审批档 shell`);
      const calls = operatorCalls.get(id)!;
      const allow = await caps.shellGate!({ command: "ls", argv: ["ls"], cwd: root, toolCallId: `t-${id}-allow` });
      assert.equal(allow.allow, true, `${id}：只读白名单（allow）直接放行`);
      assert.equal(calls.length, 0, `${id}：allow 档不弹审批卡`);
      const risky = await caps.shellGate!({
        command: "rm",
        argv: ["rm", "-rf", "x"],
        cwd: root,
        toolCallId: `t-${id}-risky`,
      });
      assert.equal(risky.allow, true, `${id}：risky 经审批批准后放行`);
      assert.equal(calls.length, 1, `${id}：risky 逐条提交审批（一次调用恰一张）`);
    }

    const l = captured.get("liaison")!.caps!;
    assert.equal(typeof l.handOffIntent, "function", "Liaison 独享 hand_off_intent");
    assert.equal(l.requestClarification, undefined, "Liaison 无 request_clarification");
    assert.equal(typeof l.customerInput, "function", "Liaison 有客户通道（编排白名单仅 intent-confirm）");
    // 2026-10-20 客户拍板：主理 Lead 成为**工作流管理者**——注入 dispatchTask，用于协调 Steward/
    // 项目角色推进工作流，不是客户批准面（真实投递路由由桌面接线测试覆盖，此处只钉能力注入）。
    assert.equal(
      typeof l.dispatchTask,
      "function",
      "Liaison 注入 dispatchTask（工作流协调用；不是客户批准；不得据此伪造客户同意）",
    );
    // 内置治理角色的 flow 三工具（Flow YAML 唯一机器状态）：flowGet / flowStepUpdate 给所有角色
    // （2026-10-24 P1-7：项目 owner 用 flow_step_update 标自己的 delivered）；flowStepSupersede
    // 只给内置治理角色（本矩阵覆盖五个 trio 内置角色）。
    assert.equal(typeof l.flowGet, "function", "Liaison 注入 flowGet（读流程状态 YAML）");
    assert.equal(typeof l.flowStepUpdate, "function", "Liaison 注入 flowStepUpdate（更新流程步骤）");
    assert.equal(typeof l.flowStepSupersede, "function", "Liaison 注入 flowStepSupersede（替代旧步骤）");
    assert.equal(l.roleStatus, undefined);
    assert.equal(l.sessionTail, undefined);
    assert.equal(l.proposeRecovery, undefined);
    assert.equal(l.installSkill, undefined);
    assert.equal(l.installMcp, undefined);
    assert.equal(typeof l.shellGate, "function", "Liaison 有审批档 shell（客户 2026-10-19：所有角色均有 shell 面）");

    const r = captured.get("rapporteur")!.caps!;
    assert.equal(typeof r.customerInput, "function", "Rapporteur 保留客户确认/选择卡");
    assert.equal(typeof r.requestClarification, "function", "Rapporteur 独享 request_clarification");
    assert.equal(r.handOffIntent, undefined);
    assert.equal(r.dispatchTask, undefined);
    assert.equal(r.installSkill, undefined);
    assert.equal(typeof r.flowGet, "function", "Rapporteur 注入 flowGet");
    assert.equal(typeof r.flowStepUpdate, "function", "Rapporteur 注入 flowStepUpdate");
    assert.equal(typeof r.flowStepSupersede, "function", "Rapporteur 注入 flowStepSupersede");

    const n = captured.get("nominator")!.caps!;
    assert.equal(typeof n.customerInput, "function");
    assert.equal(typeof n.installSkill, "function");
    assert.equal(typeof n.installMcp, "function");
    assert.equal(n.handOffIntent, undefined);
    assert.equal(n.requestClarification, undefined);
    assert.equal(n.dispatchTask, undefined);
    assert.equal(typeof n.flowGet, "function", "Nominator 注入 flowGet");
    assert.equal(typeof n.flowStepUpdate, "function", "Nominator 注入 flowStepUpdate");
    assert.equal(typeof n.flowStepSupersede, "function", "Nominator 注入 flowStepSupersede");

    const c = captured.get("convener")!.caps!;
    assert.equal(typeof c.customerInput, "function");
    assert.equal(typeof c.dispatchTask, "function");
    assert.equal(typeof c.roleStatus, "function");
    assert.equal(typeof c.sessionTail, "function");
    assert.equal(typeof c.proposeRecovery, "function");
    assert.equal(typeof c.shellGate, "function", "Convener 审批档 shell（operator-approve）");
    assert.equal(c.handOffIntent, undefined);
    assert.equal(c.requestClarification, undefined);
    assert.equal(c.installSkill, undefined);
    assert.equal(typeof c.flowGet, "function", "Convener 注入 flowGet");
    assert.equal(typeof c.flowStepUpdate, "function", "Convener 注入 flowStepUpdate");
    assert.equal(typeof c.flowStepSupersede, "function", "Convener 注入 flowStepSupersede");

    const v = captured.get("verifier")!.caps!;
    assert.equal(typeof v.customerInput, "function", "Verifier 发验收卡");
    assert.equal(v.handOffIntent, undefined);
    assert.equal(v.requestClarification, undefined);
    assert.equal(v.dispatchTask, undefined);
    assert.equal(v.installSkill, undefined);
    assert.equal(typeof v.shellGate, "function", "Verifier 审批档 shell（operator-approve）");
    assert.equal(typeof v.flowGet, "function", "Verifier 注入 flowGet");
    assert.equal(typeof v.flowStepUpdate, "function", "Verifier 注入 flowStepUpdate");
    assert.equal(typeof v.flowStepSupersede, "function", "Verifier 注入 flowStepSupersede");

    // 注册表是唯一数据来源（不散落硬编码）。
    const spec = governanceRoleOf("liaison")!;
    assert.equal(governanceCapabilitiesOf("liaison"), spec.capabilities);
    assert.deepEqual(spec.capabilities, {
      customerInput: true,
      handOffIntent: true,
      requestClarification: false,
      // 2026-10-20 客户拍板：主理 Lead 是工作流管理者（协调 Steward/项目角色），注入 dispatchTask；
      // 这不是客户批准权——批准仍只来自客户/判断代批。
      dispatchTask: true,
      roleStatus: false,
      sessionTail: false,
      proposeRecovery: false,
      installSkill: false,
      installMcp: false,
      shell: "operator-approve",
    });
    assert.equal(spec.preauthorizedDirs.includes("docs/intents/"), true, "Liaison 预授权只有意图目录");
    assert.equal(spec.preauthorizedDirs.length, 1);
  } finally {
    cleanup();
  }
});

test("工具注册面：注入 handOffIntent ⇒ 仅 hand_off_intent；注入 requestClarification ⇒ 仅 request_clarification；都不注入 ⇒ 都不存在", async () => {
  const denyGate = (): { allowed: false; reason: string; allowedByRoot: { skill: string[]; project: string[] } } => ({
    allowed: false,
    reason: "只验注册面",
    allowedByRoot: { skill: [], project: [] },
  });
  const namesOf = (opts: Parameters<typeof buildGovernedTools>[1]): string[] =>
    buildGovernedTools(denyGate, opts).map((tool) => tool.name);
  const handoffOnly = namesOf({ handOffIntent: async () => ({ ok: true }) });
  assert.equal(handoffOnly.includes("hand_off_intent"), true);
  assert.equal(handoffOnly.includes("request_clarification"), false);
  const clarifyOnly = namesOf({ requestClarification: async () => ({ ok: true }) });
  assert.equal(clarifyOnly.includes("request_clarification"), true);
  assert.equal(clarifyOnly.includes("hand_off_intent"), false);
  const neither = namesOf({});
  assert.equal(neither.includes("hand_off_intent"), false);
  assert.equal(neither.includes("request_clarification"), false);
});
