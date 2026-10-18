// test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts
// 独立端到端验收（测试角色，2026-10-17；2026-10-18 四角色同步）：新空项目默认、治理会话、能力矩阵、写权矩阵。
//
// 依据：`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md`
// §5.2/§5.3/§5.4/§5.6/§6.2/§九-1/2/3/4/7/9；全部离线（临时目录 + 假适配器），不读 `.env`、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import { openGovernanceSession } from "../../../src/pipeline/orchestration/govern-session.ts";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import { defaultShellRules } from "../../../src/common/门禁引擎/classify-shell.ts";
import type { ShellReviewResult } from "../../../src/model/runtime.ts";
import {
  GOV_REL,
  capture,
  capturingFactory,
  consume,
  customerChannel,
  makeRoot,
  trioProject,
  writeProjectRole,
} from "./fixture.ts";

// —————————————————————— 1) 新空项目默认 ——————————————————————

test("新空项目：listProject 恰 5 个 builtIn（顺序 liaison→rapporteur→nominator→convener→verifier）、primaryRoleId=liaison、governanceModel=trio", async () => {
  const { root, cleanup } = makeRoot("empty-listing");
  try {
    const listing = await listProject(root);
    const builtIns = listing.roles.filter((r) => r.builtIn === true);
    assert.deepEqual(
      builtIns.map((r) => r.roleId),
      ["liaison", "rapporteur", "nominator", "convener", "verifier"],
      "恰 5 个内置、顺序固定（2026-10-18 客户拍板「三权 · 五角色」）",
    );
    assert.deepEqual(builtIns.map((r) => r.governanceFunction), ["liaison", "proposal", "nomination", "schedule", "verification"]);
    assert.equal(listing.primaryRoleId, "liaison", "主入口 = Lead / 主理");
    assert.equal(listing.governanceModel, "trio", "新空项目默认 trio");
    assert.equal(listing.hasRoles, false, "尚无项目角色");
    assert.equal(listing.roles.some((r) => r.roleId === "su"), false, "trio 下不枚举 su");
    assert.deepEqual(listing.warnings, [], "空项目是正常态：不报警");
    for (const r of builtIns) {
      assert.equal(r.cardPath, "", "内置角色没有角色目录");
      assert.equal(r.boundaryPath, "", "内置角色没有边界文件");
      assert.ok(r.cardText.length > 0, "内置卡文本由注册表合成");
      assert.equal(r.boundary.boundarySource, `<built-in:trio/${r.roleId}>`);
    }
  } finally {
    cleanup();
  }
});

// —————————————————————— 2) 治理会话可开（function 路由；proposal/nomination/schedule） ——————————————————————

test("治理会话可开：openGovernanceSession 按 function 选择角色；显式 roleId 一致；su/非法组合明确拒绝", async () => {
  const { root, cleanup } = makeRoot("open-sessions");
  try {
    writeProjectRole(root, "A");
    const base = trioProject(root);
    const cases = [
      [{ governanceFunction: "proposal" as const }, "rapporteur", "proposal"],
      [{ governanceFunction: "nomination" as const }, "nominator", "nomination"],
      [{ governanceFunction: "schedule" as const }, "convener", "schedule"],
      [{ governanceRoleId: "rapporteur" }, "rapporteur", "proposal"],
      [{ governanceRoleId: "convener" }, "convener", "schedule"],
      [{}, "rapporteur", "proposal"], // trio 缺省 = rapporteur
    ] as const;
    for (const [opts, expectedId, expectedFn] of cases) {
      const handle = await openGovernanceSession(
        { taskId: "T-open", project: base, ...opts },
        { createAdapter: capturingFactory({}) },
      );
      assert.equal(handle.governanceRoleId, expectedId);
      assert.equal(handle.governanceFunction, expectedFn);
      assert.equal(handle.boundarySource, `<built-in:trio/${expectedId}>`);
      assert.equal(handle.acceptance.accepted, true);
      await handle.dispose();
    }

    await assert.rejects(
      () => openGovernanceSession({ taskId: "T", project: base, governanceRoleId: "su" }, { createAdapter: capturingFactory({}) }),
      /su 已归档/,
    );
    await assert.rejects(
      () =>
        openGovernanceSession(
          { taskId: "T", project: base, governanceRoleId: "rapporteur", governanceFunction: "schedule" },
          { createAdapter: capturingFactory({}) },
        ),
      /不一致/,
    );
    await assert.rejects(
      () => openGovernanceSession({ taskId: "T", project: base, governanceRoleId: "A" }, { createAdapter: capturingFactory({}) }),
      /不是内置治理角色/,
    );
  } finally {
    cleanup();
  }
});

// —————————————————————— 3) 能力矩阵逐项 ——————————————————————

test("能力矩阵：dispatch/status/sessionTail/recovery 仅 Convener；install 仅 Nominator；三个三权角色不自我回交；shell 档逐人", async () => {
  const { root, cleanup } = makeRoot("cap-matrix");
  try {
    writeProjectRole(root, "A");
    const project = trioProject(root);
    const operator = async (): Promise<{ outcome: "allow"; operatorId: string }> => ({ outcome: "allow", operatorId: "op" });
    const captured = new Map<string, ReturnType<typeof capture>>();
    for (const id of ["rapporteur", "nominator", "convener"]) {
      const cap = capture();
      captured.set(id, cap);
      const handle = await openRoleSession(
        {
          roleId: id,
          project,
          taskId: "T-cap",
          customerInput: customerChannel({ selected: [], confirmed: false }),
          dispatchTask: async () => ({ ok: true, message: "stub" }),
          proposeRecovery: async () => null,
          roleStatus: async () => null,
          sessionTail: async () => null,
          installSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
          uninstallSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
          installMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
          uninstallMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
          shellOperatorOnly: {
            classifyShell: () => "risky" as const,
            rules: defaultShellRules(),
            operatorChannel: operator,
          },
          shellReadonly:
            id === "convener" ? { classifyShell: () => "allow" as const, rules: defaultShellRules() } : undefined,
        },
        { createAdapter: capturingFactory(cap) },
      );
      await consume(handle, "（验收空脚本）");
      await handle.dispose();
    }

    const r = captured.get("rapporteur")!.caps!;
    const n = captured.get("nominator")!.caps!;
    const c = captured.get("convener")!.caps!;

    assert.equal(typeof r.customerInput, "function", "rapporteur 有客户确认通道");
    assert.equal(typeof n.customerInput, "function", "nominator 有客户确认通道");
    assert.equal(typeof c.customerInput, "function", "convener 有客户确认通道");

    for (const [label, cap] of [["rapporteur", r], ["nominator", n]] as const) {
      assert.equal(cap.dispatchTask, undefined, `${label} 不派发`);
      assert.equal(cap.roleStatus, undefined, `${label} 不 role_status`);
      assert.equal(cap.sessionTail, undefined, `${label} 不 session_tail`);
      assert.equal(cap.proposeRecovery, undefined, `${label} 不 propose_recovery`);
    }
    assert.equal(typeof c.dispatchTask, "function", "convener 独享派发");
    assert.equal(typeof c.roleStatus, "function", "convener 独享 role_status");
    assert.equal(typeof c.sessionTail, "function", "convener 独享 session_tail");
    assert.equal(typeof c.proposeRecovery, "function", "convener 独享 propose_recovery");

    assert.equal(r.installSkill, undefined, "rapporteur 不装技能");
    assert.equal(r.installMcp, undefined, "rapporteur 不装 MCP");
    assert.equal(c.installSkill, undefined, "convener 不装技能");
    assert.equal(c.installMcp, undefined, "convener 不装 MCP");
    assert.equal(typeof n.installSkill, "function", "nominator 独享 install_skill");
    assert.equal(typeof n.uninstallSkill, "function", "nominator 独享 uninstall_skill");
    assert.equal(typeof n.installMcp, "function", "nominator 独享 install_mcp");
    assert.equal(typeof n.uninstallMcp, "function", "nominator 独享 uninstall_mcp");

    for (const [label, cap] of [["rapporteur", r], ["nominator", n], ["convener", c]] as const) {
      assert.equal(cap.reportHandback, undefined, `${label} 不注入 reportHandback（不自我回交）`);
    }

    // shell 面：rapporteur/nominator 未 arm（cap.shell=none）；本轮同时传了 operator 档，编排按
    // 「cap 不允许审批档 ⇒ 不 arm」处理（互斥/能力守卫），故 convener 在**这一轮**也未 arm。
    assert.equal(r.shellGate, undefined, "rapporteur 无 shell 面（误传 approval 也不 arm）");
    assert.equal(n.shellGate, undefined, "nominator 无 shell 面");
    assert.equal(c.shellGate, undefined, "convener 误传审批档 ⇒ 不 arm（能力矩阵：只读档）");
    // 真实桌面形态：trio Convener 只传 shellReadonly（同一份 (c) 实件、不带 operator 通道）。
    const cap2 = capture();
    const handle2 = await openRoleSession(
      { roleId: "convener", project, taskId: "T-shell", shellReadonly: { classifyShell: () => "allow" as const, rules: defaultShellRules() } },
      { createAdapter: capturingFactory(cap2) },
    );
    await consume(handle2, "（验收空脚本）");
    await handle2.dispose();
    const gate = cap2.caps!.shellGate!;
    const allow: ShellReviewResult = await gate({ command: "ls", argv: ["ls"], cwd: root, toolCallId: "t1" });
    assert.equal(allow.allow, true, "convener 只读档：allow 命令放行");
    // 只读档对 risky/review/deny 一律拒绝（不出客户审批卡）。
    const riskyFactory = capture();
    const handle3 = await openRoleSession(
      {
        roleId: "convener",
        project,
        taskId: "T-shell2",
        shellReadonly: {
          classifyShell: (argv: string[]) => (argv[0] === "rm" ? ("risky" as const) : ("allow" as const)),
          rules: defaultShellRules(),
        },
      },
      { createAdapter: capturingFactory(riskyFactory) },
    );
    await consume(handle3, "（验收空脚本）");
    await handle3.dispose();
    const risky = await riskyFactory.caps!.shellGate!({ command: "rm", argv: ["rm", "-rf", "x"], cwd: root, toolCallId: "t2" });
    assert.equal(risky.allow, false, "convener 只读档：risky 一律拒绝");
    assert.match(risky.allow === false ? risky.reason : "", /只读|risky|拒绝/);
  } finally {
    cleanup();
  }
});

// —————————————————————— 4) 写权矩阵 ——————————————————————

test("写权矩阵：Rapporteur/Nominator/Convener 各自预授权范围放行；角色卡/.ans/治理边界/manifest 全拒；拒绝文案指路", async () => {
  const { root, cleanup } = makeRoot("write-matrix");
  try {
    writeProjectRole(root, "A");
    const project = trioProject(root);
    const gates = new Map<string, (p: string) => { allowed: boolean; reason?: string }>();
    for (const id of ["rapporteur", "nominator", "convener"]) {
      const cap = capture();
      const handle = await openRoleSession(
        {
          roleId: id,
          project,
          taskId: "T-writes",
          customerInput: customerChannel({ selected: [], confirmed: false }),
        },
        { createAdapter: capturingFactory(cap) },
      );
      await consume(handle, "（验收空脚本）");
      await handle.dispose();
      gates.set(id, cap.gate!);
    }

    const g = (id: string, p: string) => gates.get(id)!(p);

    // —— rapporteur ——
    for (const p of [
      "docs/proposals/flow-a-v1.md",
      "docs/contracts/c-v1.md",
      "docs/governance/rapporteur/notes.md",
    ]) {
      assert.equal(g("rapporteur", p).allowed, true, `rapporteur 预授权范围应放行：${p}`);
    }
    for (const p of [
      "角色卡/A/role-card.md",
      "角色卡/governance-boundary.yaml",
      "docs/nominations/flow-a-v1.md",
      "docs/flows/flow-a.md",
      "docs/skills/s/SKILL.md",
      "docs/mcp/m.md",
      ".ans/project.json",
      "docs/bootstrap-manifest.md",
      "src/x.ts",
    ]) {
      const d = g("rapporteur", p);
      assert.equal(d.allowed, false, `rapporteur 越界写入应拒：${p}`);
      assert.ok((d as { reason?: string }).reason && (d as { reason: string }).reason.length > 0, "拒绝须给原因");
    }
    const dRole = g("rapporteur", "角色卡/A/role-card.md");
    // rapporteur 的注册表禁写不含泛 角色卡/**（只有内置角色目录），故此处由「任命写入门」的角色守卫
    // （write-role-card 只能由 nominator 发起）拒绝——同样是 fail-closed，且文案指明正确去处。
    assert.match(dRole.allowed === false ? (dRole.reason ?? "") : "", /应用治理记录|其他治理角色|只能由 nominator 发起/);

    // —— nominator ——
    for (const p of [
      "docs/skills/s/SKILL.md",
      "docs/mcp/m.md",
      "docs/governance/nominator/notes.md",
    ]) {
      assert.equal(g("nominator", p).allowed, true, `nominator 预授权范围应放行：${p}`);
    }
    // 未任命 ⇒ 写 角色卡/** 被任命门禁拒（不是简单越界）。
    const nomCard = g("nominator", "角色卡/A/role-card.md");
    assert.equal(nomCard.allowed, false, "nominator 未取得客户任命 ⇒ 写角色卡被拒");
    assert.match(nomCard.allowed === false ? (nomCard.reason ?? "") : "", /任命|appointment/);
    for (const p of [
      "docs/proposals/flow-a-v1.md",
      "docs/flows/flow-a.md",
      "docs/bootstrap-manifest.md",
      "角色卡/governance-boundary.yaml",
      ".ans/project.json",
      ".ans/governance/ledger.jsonl",
      "src/x.ts",
    ]) {
      assert.equal(g("nominator", p).allowed, false, `nominator 越界写入应拒：${p}`);
    }

    // —— convener ——
    assert.equal(g("convener", "docs/governance/convener/notes.md").allowed, true, "convener 预授权范围应放行");
    for (const p of [
      "角色卡/A/role-card.md",
      "角色卡/governance-boundary.yaml",
      "docs/proposals/flow-a-v1.md",
      "docs/nominations/flow-a-v1.md",
      "docs/skills/s/SKILL.md",
      "docs/mcp/m.md",
      ".ans/project.json",
      ".ans/governance/ledger.jsonl",
      "docs/bootstrap-manifest.md",
      "src/x.ts",
    ]) {
      const d = g("convener", p);
      assert.equal(d.allowed, false, `convener 越界写入应拒：${p}`);
      assert.ok((d as { reason?: string }).reason && (d as { reason: string }).reason.length > 0);
    }
    const convCard = g("convener", "角色卡/A/role-card.md");
    // 2026-10-18 四角色修复后：禁写文案指回正确归属（角色卡→提名官 Nominator）。
    assert.match(convCard.allowed === false ? (convCard.reason ?? "") : "", /提名官|Nominator/);

    // 治理边界与 manifest 是应用独占：三个三权角色一致拒绝。
    for (const id of ["rapporteur", "nominator", "convener"]) {
      for (const p of [".ans/project.json", ".ans/governance/ledger.jsonl", GOV_REL, "docs/bootstrap-manifest.md"]) {
        assert.equal(g(id, p).allowed, false, `${id} 不得写应用独占路径：${p}`);
      }
    }
  } finally {
    cleanup();
  }
});
