// test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts
// 独立端到端验收（测试角色，2026-10-17；2026-10-18 四角色同步；2026-10-19 客户 shell 新规则同步）：
// 新空项目默认、治理会话、能力矩阵、写权矩阵。
//
// 依据：`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md`
// §5.2/§5.3/§5.4/§5.6/§6.2/§九-1/2/3/4/7/9；客户 2026-10-19 新规则（所有角色都有 shell 权限，
// 包括读写与任何需要命令的权限，但一律提交审批）——三权角色 `shell` 均 `"operator-approve"`。
// 全部离线（临时目录 + 假适配器），不读 `.env`、不跑真实模型。

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

test("新空项目：listProject 恰 6 个 builtIn（chief→product→rapporteur→nominator→convener→verifier）、primaryRoleId=chief、governanceModel=trio", async () => {
  const { root, cleanup } = makeRoot("empty-listing");
  try {
    const listing = await listProject(root);
    const builtIns = listing.roles.filter((r) => r.builtIn === true);
    assert.deepEqual(
      builtIns.map((r) => r.roleId),
      ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
      "恰 6 个内置、顺序固定（2026-10-28 批次 A 六角色）",
    );
    assert.deepEqual(
      builtIns.map((r) => r.governanceFunction),
      ["chief", "product", "proposal", "nomination", "schedule", "verification"],
    );
    assert.equal(listing.primaryRoleId, "chief", "主入口 = 幕僚");
    assert.equal(listing.governanceModel, "trio", "新空项目默认 trio");
    assert.equal(listing.hasRoles, false, "尚无项目角色");
    assert.equal(listing.roles.some((r) => r.roleId === "su"), false, "trio 下不枚举 su");
    assert.equal(listing.roles.some((r) => r.roleId === "liaison"), false, "旧 liaison 退休、不枚举");
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
      [{ governanceFunction: "chief" as const }, "chief", "chief"],
      [{ governanceFunction: "product" as const }, "product", "product"],
      [{ governanceFunction: "proposal" as const }, "rapporteur", "proposal"],
      [{ governanceFunction: "nomination" as const }, "nominator", "nomination"],
      [{ governanceFunction: "schedule" as const }, "convener", "schedule"],
      [{ governanceRoleId: "chief" }, "chief", "chief"],
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

test("能力矩阵：dispatch/status/sessionTail/recovery 仅 Convener；install 仅 Nominator；三个三权角色不自我回交；三角色审批档 shell（2026-10-19）", async () => {
  const { root, cleanup } = makeRoot("cap-matrix");
  try {
    writeProjectRole(root, "A");
    const project = trioProject(root);
    const operatorCalls = new Map<string, string[]>();
    const captured = new Map<string, ReturnType<typeof capture>>();
    for (const id of ["rapporteur", "nominator", "convener"]) {
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
          dispatchTask: async () => ({ ok: true, message: "stub" }),
          proposeRecovery: async () => null,
          roleStatus: async () => null,
          sessionTail: async () => null,
          installSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
          uninstallSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
          installMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
          uninstallMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
          // 客户 2026-10-19 新规则：三个三权角色的能力位都是 `shell: "operator-approve"`——
          // 传审批档选项（含操作者通道）时应 arm 审批档。
          shellOperatorOnly: {
            classifyShell: (argv: string[]) => (argv[0] === "ls" ? ("allow" as const) : ("risky" as const)),
            rules: defaultShellRules(),
            operatorChannel: operator,
          },
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

    // shell 面（客户 2026-10-19 新规则：所有角色都有 shell 权限，含读写与任意命令，但一律经审批链）：
    // 三个三权角色的能力位统一 `shell: "operator-approve"` ⇒ 传审批档选项时均 arm（不再有「无 shell 面」角色）。
    for (const [label, cap] of [["rapporteur", r], ["nominator", n], ["convener", c]] as const) {
      assert.equal(typeof cap.shellGate, "function", `${label}（operator-approve）应 arm 审批档 shell`);
    }
    // 审批档语义：allow 直放 0 卡；risky 逐条交操作者，批准后放行。
    for (const [label, cap] of [["rapporteur", r], ["nominator", n], ["convener", c]] as const) {
      const calls = operatorCalls.get(label)!;
      const allowed: ShellReviewResult = await cap.shellGate!({
        command: "ls",
        argv: ["ls"],
        cwd: root,
        toolCallId: `t-${label}-allow`,
      });
      assert.equal(allowed.allow, true, `${label} 审批档：allow 命令直接放行`);
      assert.equal(calls.length, 0, `${label} 审批档：allow 不弹审批卡`);
      const approved: ShellReviewResult = await cap.shellGate!({
        command: "rm",
        argv: ["rm", "-rf", "x"],
        cwd: root,
        toolCallId: `t-${label}-risky`,
      });
      assert.equal(approved.allow, true, `${label} 审批档：risky 经审批批准后放行`);
      assert.equal(calls.length, 1, `${label} 审批档：risky 逐条提交审批`);
    }
    // 审批链是唯一控制：操作者拒绝 / 通道不可用 ⇒ 不放行（fail-closed）。
    const denyFactory = capture();
    const denyHandle = await openRoleSession(
      {
        roleId: "rapporteur",
        project,
        taskId: "T-shell-deny",
        shellOperatorOnly: {
          classifyShell: () => "risky" as const,
          rules: defaultShellRules(),
          operatorChannel: async () => ({ outcome: "deny" as const, operatorId: "op", reason: "测试拒绝" }),
        },
      },
      { createAdapter: capturingFactory(denyFactory) },
    );
    await consume(denyHandle, "（验收空脚本）");
    await denyHandle.dispose();
    const denied: ShellReviewResult = await denyFactory.caps!.shellGate!({
      command: "rm",
      argv: ["rm", "-rf", "x"],
      cwd: root,
      toolCallId: "t-deny",
    });
    assert.equal(denied.allow, false, "审批拒绝 ⇒ 不放行");
    const unavailableFactory = capture();
    const unavailableHandle = await openRoleSession(
      {
        roleId: "nominator",
        project,
        taskId: "T-shell-unavailable",
        shellOperatorOnly: {
          classifyShell: () => "risky" as const,
          rules: defaultShellRules(),
          operatorChannel: async () => ({ outcome: "unavailable" as const, reason: "测试通道不可用" }),
        },
      },
      { createAdapter: capturingFactory(unavailableFactory) },
    );
    await consume(unavailableHandle, "（验收空脚本）");
    await unavailableHandle.dispose();
    const unavailable: ShellReviewResult = await unavailableFactory.caps!.shellGate!({
      command: "rm",
      argv: ["rm", "-rf", "x"],
      cwd: root,
      toolCallId: "t-unavailable",
    });
    assert.equal(unavailable.allow, false, "通道不可用 ⇒ 不放行（fail-closed）");
    // 旧只读档兼容路径（2026-10-19 起桌面不再注入；产品保留，执行集更严、不放宽）：
    // trio Convener 只传 shellReadonly（同一份 (c) 实件、不带 operator 通道）。
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
