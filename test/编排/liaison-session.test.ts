// test/编排/liaison-session.test.ts
// 四角色 W6-A（2026-10-18）：编排层能力矩阵、hand_off_intent / request_clarification 接线、
// 函数路由与旧行为不回归。
//
// 覆盖：
//   ① 能力矩阵：Liaison（handOffIntent，无 customerInput/dispatch/看护/安装/shell）、
//      Rapporteur（customerInput + requestClarification）、Nominator（install）、Convener（dispatch/看护/
//      只读 shell）、su（旧行为逐字不变）；
//   ② hand_off_intent：校验通过 → 投递回调 + 账本 `intent.handed-off`；投递失败如实回执、零账本；
//      校验失败不投递；每轮一次；去重；
//   ③ request_clarification：两轮上限 + 账本 `clarification.requested`；送达失败零账本；
//   ④ 函数路由：`--function liaison` 可用、缺省 proposal 保持；single 下明确拒绝；
//   ⑤ 提示词数据驱动（不写死 su/rapporteur），且不写「已批准/已授权」。
//
// 全部临时目录、假适配器；不读 `.env`、不跑真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  openRoleSession,
  type AdapterCapabilities,
} from "../../src/pipeline/orchestration/run-role.ts";
import { openGovernanceSession, runGovernSession } from "../../src/pipeline/orchestration/govern-session.ts";
import { classifyShell, defaultShellRules } from "../../src/common/门禁引擎/classify-shell.ts";
import {
  appendGovernanceLedger,
  flushGovernanceLedger,
  governanceLedgerPath,
  readGovernanceLedger,
} from "../../src/common/编排/governance-ledger.ts";
import { parseGovernArgs } from "../../src/common/编排/args.ts";
import { governCommand } from "../../src/interface/cli/govern.ts";
import { EXIT_OK, EXIT_USAGE } from "../../src/common/编排/exit-codes.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { CustomerInputFn, HandOffIntentPayload } from "../../src/model/runtime.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";

// —————————————————————— 夹具 ——————————————————————

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-liaison-session-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

const GOV_BOUNDARY_REL = "角色卡/governance-boundary.yaml";
const GOV_BOUNDARY_YAML = [
  "role: 治理边界",
  "entries:",
  "  - kind: conditional-directory",
  "    path: 角色卡/",
  "    condition: role-restructuring",
  "    root: project",
  "    purpose: 项目治理产物：角色目录",
  "  - kind: conditional-directory",
  "    path: docs/",
  "    condition: docs-bootstrap",
  "    root: project",
  "    purpose: 项目文档",
  "",
].join("\n");

function trioProject(root: string): ProjectConfig {
  mkdirSync(join(root, ".ans"), { recursive: true });
  writeFileSync(join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: [],
    governanceBoundary: { path: GOV_BOUNDARY_REL, acceptance: { accepted: true, source: "test:trio" } },
  };
}

function singleProject(root: string): ProjectConfig {
  mkdirSync(join(root, "角色卡"), { recursive: true });
  writeFileSync(join(root, GOV_BOUNDARY_REL), GOV_BOUNDARY_YAML);
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "single",
    builtInRoles: ["su"],
    governanceBoundary: { path: GOV_BOUNDARY_REL, acceptance: { accepted: true, source: "test:single" } },
  };
}

function projectRole(root: string): ProjectConfig {
  const dir = join(root, "角色卡", "X");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "role-card.md"), "# X\n");
  writeFileSync(join(dir, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: test\n");
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceModel: "single",
    builtInRoles: [],
  };
}

function withBuiltIn(project: ProjectConfig, roleId: string): ProjectConfig {
  return { ...project, builtInRoles: [roleId] };
}

function writeIntentFile(root: string, intentId = "intent-a", handoffKind = "initial"): void {
  mkdirSync(join(root, "docs", "intents"), { recursive: true });
  writeFileSync(
    join(root, "docs", "intents", `${intentId}.md`),
    [
      "---",
      `intentId: ${intentId}`,
      `handoffKind: ${handoffKind}`,
      "goal: 让客户能接受一份提案",
      "scope: 只读分析，不改代码",
      "acceptance: 客户接受提案且流程可验收",
      "flowId: flow-a",
      "customerWords: 客户说做一个提案流程",
      "---",
      "",
    ].join("\n"),
  );
}

/** 需求确认前置（2026-10-18）：客户对 flow-a 的 intent-confirm accepted 决定。 */
async function seedIntentConfirm(root: string): Promise<void> {
  await appendGovernanceLedger(root, {
    at: new Date().toISOString(),
    kind: "customer.decision",
    actorRoleId: "liaison",
    power: "liaison",
    flowId: "flow-a",
    decisionKind: "intent-confirm",
    customerDecision: "accepted",
    messageSummary: "需求确认",
  });
  await flushGovernanceLedger(root);
}

function handoffPayload(over: Partial<HandOffIntentPayload> = {}): HandOffIntentPayload {  return {
    intentId: "intent-a",
    handoffKind: "initial",
    goal: "让客户能接受一份提案",
    scope: "只读分析，不改代码",
    acceptance: "客户接受提案且流程可验收",
    summary: "客户想做提案流程",
    flowId: "flow-a",
    ...over,
  };
}

/** 桩适配器：立即 settled；记录绑定的角色。 */
function okAdapter(bound?: { roleId?: string }): RuntimeAdapter {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(role): Promise<RoleSession> {
      if (bound !== undefined) bound.roleId = role.id;
      return {
        async prompt(): Promise<void> {},
        events(): AsyncIterable<SessionEvent> {
          return (async function* () {
            yield { kind: "settled", summary: "完成" } as SessionEvent;
          })();
        },
        async dispose(): Promise<void> {},
      };
    },
  };
}

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured, bound: { roleId?: string } = {}) {
  return (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.gate = gate;
    captured.caps = caps;
    return okAdapter(bound);
  };
}

const confirmAllow: CustomerInputFn = () => ({
  outcome: "answered",
  value: { confirmed: true },
  operatorId: "test-客户",
});

function capabilityStubs() {
  return {
    dispatchTask: () => ({ ok: true }),
    roleStatus: () => ({ ok: true, text: "状态" }),
    sessionTail: () => ({ ok: true, text: "尾线" }),
    proposeRecovery: () => ({ outcome: "declined" as const }),
    installSkill: async (payload: { roleId: string; name: string }) => ({
      ok: true as const,
      action: "installed" as const,
      roleId: payload.roleId,
      name: payload.name,
      path: `docs/skills/${payload.name}/SKILL.md`,
      digest: "0".repeat(64),
      effective: "next-session" as const,
    }),
    uninstallSkill: async (payload: { roleId: string; name: string }) => ({
      ok: true as const,
      action: "uninstalled" as const,
      roleId: payload.roleId,
      name: payload.name,
      path: `docs/skills/${payload.name}/SKILL.md`,
      digest: "0".repeat(64),
      effective: "next-session" as const,
    }),
    installMcp: async (payload: { roleId: string; name: string }) => ({
      ok: true as const,
      action: "installed" as const,
      roleId: payload.roleId,
      name: payload.name,
      path: `docs/mcp/${payload.name}.md`,
      digest: "0".repeat(64),
      effective: "next-session" as const,
    }),
    uninstallMcp: async (payload: { roleId: string; name: string }) => ({
      ok: true as const,
      action: "uninstalled" as const,
      roleId: payload.roleId,
      name: payload.name,
      path: `docs/mcp/${payload.name}.md`,
      digest: "0".repeat(64),
      effective: "next-session" as const,
    }),
    customerInput: (() => ({ outcome: "declined" as const })) as CustomerInputFn,
    handOffIntent: () => ({ ok: true }),
    requestClarification: () => ({ ok: true }),
    shellOperatorOnly: { classifyShell, rules: defaultShellRules(), operatorChannel: () => ({ outcome: "deny" as const }) },
  };
}

const GOVERNANCE_KEYS = [
  "customerInput",
  "handOffIntent",
  "requestClarification",
  "dispatchTask",
  "roleStatus",
  "sessionTail",
  "proposeRecovery",
  "installSkill",
  "uninstallSkill",
  "installMcp",
  "uninstallMcp",
  "shellGate",
  "reportHandback",
] as const;

// —————————————————————— ① 能力矩阵 ——————————————————————

test("能力矩阵：Liaison/Rapporteur/Nominator/Convener/su 按注册表注入（其余能力不注入）", async () => {
  await withRoot(async (root) => {
    const project = trioProject(root);
    const provide = capabilityStubs();

    const l = {} as Captured;
    const lh = await openRoleSession(
      { roleId: "liaison", project: withBuiltIn(project, "liaison"), autoRepin: false, ...provide },
      { createAdapter: capturingFactory(l) },
    );
    await lh.dispose();
    assert.ok(l.caps?.handOffIntent, "Liaison 应注入 handOffIntent");
    assert.ok(l.caps?.customerInput, "Liaison 有客户需求确认通道（intent-confirm）");
    assert.ok(l.caps?.dispatchTask, "Liaison 应注入 dispatchTask（2026-10-20 Lead→Steward coordinate）");
    assert.equal(typeof l.caps?.flowGet, "function", "Liaison 有 flowGet");
    assert.equal(typeof l.caps?.shellGate, "function", "Liaison（operator-approve）应 arm 审批档 shellGate");
    for (const key of GOVERNANCE_KEYS.filter(
      (k) => !["handOffIntent", "customerInput", "dispatchTask", "shellGate"].includes(k),
    )) {
      assert.equal(l.caps?.[key], undefined, `Liaison 不应注入 ${key}`);
    }

    const r = {} as Captured;
    const rh = await openRoleSession(
      { roleId: "rapporteur", project: withBuiltIn(project, "rapporteur"), autoRepin: false, ...provide },
      { createAdapter: capturingFactory(r) },
    );
    await rh.dispose();
    assert.ok(r.caps?.customerInput, "Rapporteur 有客户确认通道");
    assert.ok(r.caps?.requestClarification, "Rapporteur 应注入 requestClarification");
    assert.equal(typeof r.caps?.shellGate, "function", "Rapporteur（operator-approve）应 arm 审批档 shellGate");
    for (const key of GOVERNANCE_KEYS.filter((k) => k !== "customerInput" && k !== "requestClarification" && k !== "shellGate")) {
      assert.equal(r.caps?.[key], undefined, `Rapporteur 不应注入 ${key}`);
    }

    const n = {} as Captured;
    const nh = await openRoleSession(
      { roleId: "nominator", project: withBuiltIn(project, "nominator"), autoRepin: false, ...provide },
      { createAdapter: capturingFactory(n) },
    );
    await nh.dispose();
    for (const key of ["installSkill", "uninstallSkill", "installMcp", "uninstallMcp"] as const) {
      assert.ok(n.caps?.[key], `Nominator 应注入 ${key}`);
    }
    assert.equal(typeof n.caps?.shellGate, "function", "Nominator（operator-approve）应 arm 审批档 shellGate");
    for (const key of GOVERNANCE_KEYS.filter(
      (k) => !["customerInput", "installSkill", "uninstallSkill", "installMcp", "uninstallMcp", "shellGate"].includes(k),
    )) {
      assert.equal(n.caps?.[key], undefined, `Nominator 不应注入 ${key}`);
    }

    const c = {} as Captured;
    const ch = await openRoleSession(
      { roleId: "convener", project: withBuiltIn(project, "convener"), autoRepin: false, ...provide },
      { createAdapter: capturingFactory(c) },
    );
    await ch.dispose();
    for (const key of ["customerInput", "dispatchTask", "roleStatus", "sessionTail", "proposeRecovery", "shellGate"] as const) {
      assert.ok(c.caps?.[key], `Convener 应注入 ${key}`);
    }
    for (const key of GOVERNANCE_KEYS.filter(
      (k) => !["customerInput", "dispatchTask", "roleStatus", "sessionTail", "proposeRecovery", "shellGate"].includes(k),
    )) {
      assert.equal(c.caps?.[key], undefined, `Convener 不应注入 ${key}`);
    }

    const s = {} as Captured;
    const sh = await openRoleSession(
      {
        roleId: "su",
        project: singleProject(root),
        autoRepin: false,
        dispatchTask: provide.dispatchTask,
        roleStatus: provide.roleStatus,
        sessionTail: provide.sessionTail,
        proposeRecovery: provide.proposeRecovery,
        installSkill: provide.installSkill,
        installMcp: provide.installMcp,
        customerInput: provide.customerInput,
        handOffIntent: provide.handOffIntent,
        requestClarification: provide.requestClarification,
        shellOperatorOnly: { classifyShell, rules: defaultShellRules(), operatorChannel: () => ({ outcome: "deny" }) },
      },
      { createAdapter: capturingFactory(s) },
    );
    await sh.dispose();
    for (const key of ["customerInput", "dispatchTask", "roleStatus", "sessionTail", "proposeRecovery", "installSkill", "installMcp", "shellGate"] as const) {
      assert.ok(s.caps?.[key], `su（single）应注入 ${key}（旧行为）`);
    }
    assert.equal(s.caps?.handOffIntent, undefined, "su 不获得 handOffIntent");
    assert.equal(s.caps?.requestClarification, undefined, "su 不获得 requestClarification");
  });
});

// —————————————————————— ② hand_off_intent ——————————————————————

test("hand_off_intent：校验通过 → 投递回调 + 账本 intent.handed-off（power=liaison）", async () => {
  await withRoot(async (root) => {
    writeIntentFile(root);
    await seedIntentConfirm(root);
    const project = withBuiltIn(trioProject(root), "liaison");
    const delivered: HandOffIntentPayload[] = [];
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project,
        autoRepin: false,
        customerInput: confirmAllow,
        handOffIntent: (payload) => {
          delivered.push(payload);
          return { ok: true, message: "报告员工作中，已排队" };
        },
      },
      { createAdapter: capturingFactory(captured) },
    );
    let receipt;
    try {
      assert.ok(captured.caps?.handOffIntent);
      receipt = await captured.caps!.handOffIntent!(handoffPayload(), { turnId: "turn-1", roleId: "liaison" });
    } finally {
      await handle.dispose();
    }
    assert.equal(receipt.ok, true);
    if (receipt.ok) assert.match(receipt.message ?? "", /交接 ≠ 客户批准/);
    assert.equal(delivered.length, 1);
    assert.deepEqual(delivered[0], handoffPayload());

    await flushGovernanceLedger(root);
    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, []);
    const handoff = entries.find((entry) => entry.kind === "intent.handed-off");
    assert.ok(handoff, "应写 intent.handed-off");
    assert.equal(handoff.actorRoleId, "liaison");
    assert.equal(handoff.power, "liaison");
    assert.equal(handoff.intentId, "intent-a");
    assert.equal(handoff.handoffKind, "initial");
    assert.equal(handoff.targetRoleId, "rapporteur");
    assert.equal(handoff.flowId, "flow-a");
    assert.equal(handoff.artifactPath, "docs/intents/intent-a.md");
    assert.match(handoff.artifactSha256 ?? "", /^[0-9a-f]{64}$/);
    assert.equal(handoff.messageSummary, "客户想做提案流程");
    assert.equal(handoff.turnId, "turn-1");
  });
});

test("hand_off_intent：投递失败 → 如实回执、不重试、零账本", async () => {
  await withRoot(async (root) => {
    writeIntentFile(root);
    await seedIntentConfirm(root);
    const project = withBuiltIn(trioProject(root), "liaison");
    let calls = 0;
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project,
        autoRepin: false,
        handOffIntent: () => {
          calls += 1;
          return { ok: false, message: "报告员会话忙" };
        },
      },
      { createAdapter: capturingFactory(captured) },
    );
    let receipt;
    try {
      receipt = await captured.caps!.handOffIntent!(handoffPayload(), { turnId: "turn-1", roleId: "liaison" });
    } finally {
      await handle.dispose();
    }
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /报告员会话忙/);
    assert.match(receipt.message ?? "", /未重试/);
    assert.equal(calls, 1, "不循环重试");

    await flushGovernanceLedger(root);
    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.filter((entry) => entry.kind === "intent.handed-off").length, 0, "失败不写成功账本");
  });
});

test("hand_off_intent：校验失败（意图文件缺失）→ 不投递、零账本", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "liaison");
    let calls = 0;
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project,
        autoRepin: false,
        handOffIntent: () => {
          calls += 1;
          return { ok: true };
        },
      },
      { createAdapter: capturingFactory(captured) },
    );
    let receipt;
    try {
      receipt = await captured.caps!.handOffIntent!(handoffPayload(), { turnId: "turn-1", roleId: "liaison" });
    } finally {
      await handle.dispose();
    }
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /不存在/);
    assert.equal(calls, 0, "校验失败不得触达投递回调");
    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.length, 0);
  });
});

test("hand_off_intent：每轮一次 + 去重（成功一次后不再投递）", async () => {
  await withRoot(async (root) => {
    writeIntentFile(root);
    await seedIntentConfirm(root);
    const project = withBuiltIn(trioProject(root), "liaison");
    let calls = 0;
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project,
        autoRepin: false,
        handOffIntent: () => {
          calls += 1;
          return { ok: true };
        },
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const first = await captured.caps!.handOffIntent!(handoffPayload(), { turnId: "turn-1", roleId: "liaison" });
      assert.equal(first.ok, true);
      const sameTurn = await captured.caps!.handOffIntent!(handoffPayload(), { turnId: "turn-1", roleId: "liaison" });
      assert.equal(sameTurn.ok, false);
      assert.match(sameTurn.message ?? "", /每轮至多一次/);
      const nextTurn = await captured.caps!.handOffIntent!(handoffPayload(), { turnId: "turn-2", roleId: "liaison" });
      assert.equal(nextTurn.ok, false);
      assert.match(nextTurn.message ?? "", /不重复派发/);
      assert.equal(calls, 1, "只有第一次成功触达投递");
    } finally {
      await handle.dispose();
    }
  });
});

async function consume(handle: { events(): AsyncIterable<{ kind: string }> }): Promise<void> {
  for await (const _event of handle.events()) {
    /* 消费到 settled */
  }
}

test("hand_off_intent：同轮并发两次 → 串行化后仅一次成功（每轮一次机械成立）", async () => {
  await withRoot(async (root) => {
    writeIntentFile(root);
    await seedIntentConfirm(root);
    const project = withBuiltIn(trioProject(root), "liaison");
    let calls = 0;
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project,
        autoRepin: false,
        handOffIntent: async () => {
          calls += 1;
          return { ok: true };
        },
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const metadata = { turnId: "turn-1", roleId: "liaison" } as const;
      const results = await Promise.all([
        captured.caps!.handOffIntent!(handoffPayload(), metadata),
        captured.caps!.handOffIntent!(handoffPayload(), metadata),
      ]);
      assert.equal(results.filter((receipt) => receipt.ok).length, 1, "并发同轮仅一次成功");
      assert.equal(calls, 1, "只有一次触达投递");
    } finally {
      await handle.dispose();
    }
  });
});

// —————————————————————— ③ artifact.observed（Liaison 覆盖 docs/intents/） ——————————————————————

test("Liaison artifact.observed：settle 后新增 docs/intents/*.md → power=liaison", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "liaison");
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project,
        autoRepin: false,
        handOffIntent: () => ({ ok: true }),
      },
      { createAdapter: () => okAdapter() },
    );
    try {
      // open 时基线为空；会后新增意图文件 → 本轮 settle 应观察并写账本。
      writeIntentFile(root, "intent-b");
      await handle.send("开始");
      await consume(handle);
    } finally {
      await handle.dispose();
    }
    await flushGovernanceLedger(root);
    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, []);
    const observed = entries.filter((entry) => entry.kind === "artifact.observed");
    assert.equal(observed.length, 1);
    assert.equal(observed[0].actorRoleId, "liaison");
    assert.equal(observed[0].power, "liaison");
    assert.equal(observed[0].artifactPath, "docs/intents/intent-b.md");
    assert.match(observed[0].artifactSha256 ?? "", /^[0-9a-f]{64}$/);
  });
});

// —————————————————————— ③ request_clarification ——————————————————————
test("request_clarification：两轮上限 + 账本 clarification.requested", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "rapporteur");
    const delivered: string[] = [];
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project,
        autoRepin: false,
        customerInput: confirmAllow,
        requestClarification: (payload) => {
          delivered.push(payload.question);
          return { ok: true, message: "已在主入口显示" };
        },
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.ok(captured.caps?.requestClarification);
      const first = await captured.caps!.requestClarification!(
        { flowId: "flow-a", question: "验收范围包含文档吗？" },
        { turnId: "turn-1", roleId: "rapporteur" },
      );
      assert.equal(first.ok, true);
      assert.match(first.message ?? "", /第 1 轮/);
      const second = await captured.caps!.requestClarification!(
        { flowId: "flow-a", question: "还需要示例吗？" },
        { turnId: "turn-2", roleId: "rapporteur" },
      );
      assert.equal(second.ok, true);
      assert.match(second.message ?? "", /第 2 轮/);
      const third = await captured.caps!.requestClarification!(
        { flowId: "flow-a", question: "再问一次？" },
        { turnId: "turn-3", roleId: "rapporteur" },
      );
      assert.equal(third.ok, false);
      assert.match(third.message ?? "", /2 轮/);
      assert.match(third.message ?? "", /提案卡/);
      assert.equal(delivered.length, 2, "第三轮不触达送达端");
    } finally {
      await handle.dispose();
    }

    await flushGovernanceLedger(root);
    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, []);
    const clarifications = entries.filter((entry) => entry.kind === "clarification.requested");
    assert.equal(clarifications.length, 2);
    for (const entry of clarifications) {
      assert.equal(entry.actorRoleId, "rapporteur");
      assert.equal(entry.power, "proposal");
      assert.equal(entry.flowId, "flow-a");
      assert.match(entry.messageSummary ?? "", /问|吗/);
    }
  });
});

test("request_clarification：送达失败 → 如实回执、不重试、零账本", async () => {
  await withRoot(async (root) => {
    const project = withBuiltIn(trioProject(root), "rapporteur");
    let calls = 0;
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project,
        autoRepin: false,
        requestClarification: () => {
          calls += 1;
          return { ok: false, message: "主入口不可用" };
        },
      },
      { createAdapter: capturingFactory(captured) },
    );
    let receipt;
    try {
      receipt = await captured.caps!.requestClarification!(
        { intentId: "intent-a", question: "范围？" },
        { turnId: "turn-1", roleId: "rapporteur" },
      );
    } finally {
      await handle.dispose();
    }
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /主入口不可用/);
    assert.match(receipt.message ?? "", /未重试/);
    assert.equal(calls, 1);
    const { entries } = await readGovernanceLedger(root);
    assert.equal(entries.length, 0);
  });
});

// —————————————————————— ④ 函数路由 / 提示词 ——————————————————————

test("函数路由：CLI 显式拒绝 liaison（AC21）；引擎可路由；缺省 proposal 保持；single 拒绝", async () => {
  for (const fn of ["proposal", "nomination", "schedule"] as const) {
    const parsed = parseGovernArgs(["govern", "--function", fn]);
    assert.equal(parsed.function, fn);
    assert.deepEqual(parsed.errors, []);
  }
  assert.equal(parseGovernArgs(["govern"]).function, undefined);
  const rejected = parseGovernArgs(["govern", "--function", "liaison"]);
  assert.equal(rejected.function, undefined);
  assert.ok(rejected.errors.some((e) => /仅桌面主入口提供/.test(e)));
  assert.ok(parseGovernArgs(["govern", "--function", "bogus"]).errors.some((e) => /非法的 --function/.test(e)));

  await withRoot(async (root) => {
    const project = trioProject(root);
    // 引擎层（桌面/测试前端）仍接受 liaison（评审 §4.5）——CLI 层另行拒绝。
    const liaison = await openGovernanceSession(
      { taskId: "T", project, governanceFunction: "liaison" },
      { createAdapter: () => okAdapter() },
    );
    assert.equal(liaison.governanceRoleId, "liaison");
    assert.equal(liaison.governanceFunction, "liaison");
    await liaison.dispose();

    const byDefault = await openGovernanceSession({ taskId: "T", project }, { createAdapter: () => okAdapter() });
    assert.equal(byDefault.governanceRoleId, "rapporteur", "缺省仍是 proposal→rapporteur");
    await byDefault.dispose();

    const configSource = {
      kind: "ans" as const,
      path: join(root, ".ans", "project.json"),
      acceptance: project.governanceBoundary!.acceptance,
      pinPaths: [],
    };
    // CLI 收窄（AC21）：--function liaison 与 --role liaison 均明确拒绝（用法错误）。
    assert.equal(
      await governCommand(["govern", "--function", "liaison"], {
        project,
        configSource,
        customerInput: confirmAllow,
        createAdapter: () => okAdapter(),
      }),
      EXIT_USAGE,
    );
    assert.equal(
      await governCommand(["govern", "--role", "liaison"], {
        project,
        configSource,
        createAdapter: () => okAdapter(),
      }),
      EXIT_USAGE,
    );

    // 三权 CLI 行为不变。
    const bound = {} as { roleId?: string };
    assert.equal(
      await governCommand(["govern", "--function", "proposal"], {
        project,
        configSource,
        customerInput: confirmAllow,
        createAdapter: () => okAdapter(bound),
      }),
      EXIT_OK,
    );
    assert.equal(bound.roleId, "rapporteur");

    const single = singleProject(root);
    await assert.rejects(
      openGovernanceSession({ taskId: "T", project: single, governanceFunction: "liaison" }, { createAdapter: () => okAdapter() }),
      /single/,
    );
    const singleCode = await governCommand(["govern", "--function", "liaison"], {
      project: single,
      configSource,
      createAdapter: () => okAdapter(),
    });
    assert.equal(singleCode, EXIT_USAGE);
  });
});

test("提示词：Liaison 沟通权纪律（数据驱动名称），不写「已批准/已授权」", async () => {
  await withRoot(async (root) => {
    const captured: { prompt?: string } = {};
    const factory = (): RuntimeAdapter => ({
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return {
          async prompt(text: string): Promise<void> {
            captured.prompt = text;
          },
          events(): AsyncIterable<SessionEvent> {
            return (async function* () {
              yield { kind: "settled", summary: "完成" } as SessionEvent;
            })();
          },
          async dispose(): Promise<void> {},
        };
      },
    });
    const result = await runGovernSession(
      { taskId: "T-LIAISON", project: trioProject(root), governanceFunction: "liaison", customerInput: confirmAllow },
      { createAdapter: factory },
    );
    assert.equal(result.code, EXIT_OK);
    assert.ok(captured.prompt !== undefined);
    assert.match(captured.prompt!, /沟通权纪律（Lead \/ 主理/);
    assert.match(captured.prompt!, /docs\/intents\//);
    assert.match(captured.prompt!, /hand_off_intent/);
    assert.match(captured.prompt!, /交接 ≠ 客户批准/);
    assert.doesNotMatch(captured.prompt!, /已批准|已授权/);
    // 数据驱动：标题必须来自注册表 displayName，而不是写死英文角色名。
    assert.match(captured.prompt!, /Lead \/ 主理/);
  });
});

// —————————————————————— ⑤ 旧行为不回归 ——————————————————————

test("旧行为：项目角色只保留客户通道，不获得治理交接/澄清能力", async () => {
  await withRoot(async (root) => {
    const captured = {} as Captured;
    const handle = await openRoleSession(
      {
        roleId: "X",
        project: projectRole(root),
        autoRepin: false,
        customerInput: confirmAllow,
        handOffIntent: () => ({ ok: true }),
        requestClarification: () => ({ ok: true }),
      },
      { createAdapter: capturingFactory(captured) },
    );
    await handle.dispose();
    assert.ok(captured.caps?.customerInput, "项目角色客户通道逐字不变");
    assert.equal(captured.caps?.handOffIntent, undefined);
    assert.equal(captured.caps?.requestClarification, undefined);
    for (const key of ["dispatchTask", "roleStatus", "sessionTail", "proposeRecovery", "installSkill", "installMcp"] as const) {
      assert.equal(captured.caps?.[key], undefined, `项目角色不应注入 ${key}`);
    }
    assert.equal(existsSync(governanceLedgerPath(root)), false, "项目角色不写治理账本");
  });
});
