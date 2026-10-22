// test/测试/governance-trio-verify/b-gates-dispatch-ledger.test.ts
// 独立端到端验收（测试角色，2026-10-17）：三道门禁、派发五条、快捷路径、账本字段/顺序与可还原性、
// 一项目一待决定队列、账本坏 fail-closed / append 失败不翻转。
//
// 依据：评审 §5.7/§5.8/§6.1/§6.2/§6.3/§6.4/§九-5/6/7/10/11/16/17/19/21。
// 全部离线（临时目录 + 假适配器 + 假桌面装配），不读 `.env`、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

import { openGovernanceSession } from "../../../src/pipeline/orchestration/govern-session.ts";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import { createFakeRuntimeAdapter } from "../../../src/provider/pi/session.ts";
import { createCustomerInputChannel } from "../../../app/desktop/customer-input.ts";
import {
  appendGovernanceLedger,
  evaluateGovernanceGate,
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../../src/pipeline/orchestration/govern-session.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";
import type { OpenResult } from "../../../app/desktop/session.ts";
import {
  capture,
  capturingFactory,
  consume,
  customerChannel,
  flowDoc,
  ledgerEntry,
  makeRoot,
  proposalDoc,
  sha256,
  trioProject,
  waitForLedger,
  write,
  writeProjectRole,
} from "./fixture.ts";

const FLOW = "flow-a";
const STEP = "impl";

/**
 * 实施前验收标准（2026-10-22 第 3 项/O2）：已有 appointment 决定的 flow 在派发项目角色前，
 * 门禁要求 `docs/acceptance/<flowId>-criteria-v1.md` 存在且结构合格。派发门禁用例按新门槛
 * 先写出标准，才能测到「步骤缺失/重复派发」等后续判定（不删除门槛、不放宽断言）。
 */
const ACCEPTANCE_CRITERIA_DOC = [
  "---",
  `flowId: ${FLOW}`,
  "version: 1",
  "---",
  "",
  `# 验收完成标准 ${FLOW}`,
  "",
  "| ID | 标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  "| P1 | 交付满足提案 | 测试输出 | 待提交 | 候选哈希 | 测试 | 待判定 | 待判定 |",
  "",
  "风险档位：T3。",
  "",
  "判定规则：pass / fail / insufficient evidence。",
  "",
  "证据计划：测试命令输出与候选哈希。",
  "",
  "版本与冻结：写盘后冻结。",
  "",
].join("\n");

/** 团队计划（2026-10-22 第 1 项）：Convener 唯一作者；卡前守卫的确定性形状。 */
const TEAM_PLAN_REL = `docs/scheduling/${FLOW}-team-v1.md`;
const TEAM_PLAN_DOC = [
  "---",
  `flowId: ${FLOW}`,
  "version: 1",
  "riskTier: T3",
  "recommended: [A]",
  "---",
  "",
  `# 团队计划 ${FLOW} v1`,
  "",
  "| roleId | 类型 | 职责目标 | 能力要求 | 唯一写集 | 依赖 | 组别 | apiSpec |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  "| A | new | 实现流程步骤 | 能写代码 | src/owned-A/ | 无 | 开发 | not-applicable |",
  "",
].join("\n");

async function seed(root: string, entries: GovernanceLedgerEntry[]): Promise<void> {
  for (const entry of entries) {
    const r = await appendGovernanceLedger(root, entry);
    assert.equal(r.ok, true, JSON.stringify(r));
  }
}

async function gateOf(
  root: string,
  roleId: "rapporteur" | "nominator" | "convener",
  project: ProjectConfig = trioProject(root),
  opts: { confirmation?: boolean } = {},
): Promise<(p: string) => { allowed: boolean; reason?: string }> {
  const cap = capture();
  const confirmation = opts.confirmation ?? true;
  const handle = await openRoleSession(
    {
      roleId,
      project,
      taskId: "T-gate",
      ...(confirmation ? { customerInput: customerChannel({ selected: [], confirmed: false }) } : {}),
    },
    { createAdapter: capturingFactory(cap) },
  );
  await consume(handle, "（验收空脚本）");
  await handle.dispose();
  assert.ok(cap.gate, `${roleId} 应有 gate`);
  return cap.gate;
}

// —————————————————————— 1) 三道门禁 ——————————————————————

test("提案接受门：无客户接受 → Convener 写 flow / Nominator 写 nomination 均拒；提案文件自称 accepted 不算", async () => {
  const { root, cleanup } = makeRoot("gate-proposal");
  try {
    writeProjectRole(root, "A");
    write(root, `docs/proposals/${FLOW}-v1.md`, proposalDoc(FLOW).replace("status: draft", "status: accepted"));
    const convener = await gateOf(root, "convener");
    const dFlow = convener(`docs/flows/${FLOW}.md`);
    assert.equal(dFlow.allowed, false, "无账本 customer.decision（accept）⇒ 写 flow 被拒");
    assert.match(dFlow.reason ?? "", /提案|Rapporteur/);

    const nominator = await gateOf(root, "nominator");
    const dNom = nominator(`docs/nominations/${FLOW}-v1.md`);
    assert.equal(dNom.allowed, false, "无客户接受 ⇒ 写提名被拒");
    assert.match(dNom.reason ?? "", /提案|Rapporteur/);
  } finally {
    cleanup();
  }
});

test("任命写入门：无任命 → Nominator 写 角色卡/** 拒；有任命名单 → 放行；不在名单的目标仍拒", async () => {
  const { root, cleanup } = makeRoot("gate-appointment");
  try {
    writeProjectRole(root, "A");
    writeProjectRole(root, "B");
    await seed(root, [ledgerEntry({ decisionKind: "proposal-accept", customerDecision: "accepted" })]);
    // 无客户通道 = 非确认制：本用例只验任命写入门本身（F4 发行语义不是本项）。
    const nominator = await gateOf(root, "nominator", trioProject(root), { confirmation: false });
    const denied = nominator("角色卡/A/role-card.md");
    assert.equal(denied.allowed, false, "无任命决定 ⇒ 写角色卡被拒");
    assert.match(denied.reason ?? "", /任命|appointment/);

    await seed(root, [
      ledgerEntry({
        kind: "customer.decision",
        actorRoleId: "nominator",
        power: "nomination",
        decisionKind: "appointment",
        customerDecision: "appointed",
        targetRoleIds: ["A"],
      }),
    ]);
    const nominator2 = await gateOf(root, "nominator", trioProject(root), { confirmation: false });
    assert.equal(nominator2("角色卡/A/role-card.md").allowed, true, "任命名单含 A ⇒ 写 A 角色卡放行");
    const other = nominator2("角色卡/B/role-card.md");
    assert.equal(other.allowed, false, "未任命 B ⇒ 写 B 角色卡仍拒");
    assert.match(other.reason ?? "", /任命|appointment/);
  } finally {
    cleanup();
  }
});

test("派发门禁（run-role）：目标内置 / 无接受 / 不在任命名单 / 缺 flowId+stepId / 步骤不存在 / 重复派发 全部拒；快捷路径放行", async () => {
  const scenarios: Array<{
    name: string;
    seed: GovernanceLedgerEntry[];
    flowSteps?: string[];
    payload: { roleId: string; task: string; flowId?: string; stepId?: string };
    expectCode: RegExp;
    allowed?: boolean;
  }> = [
    {
      name: "目标内置治理角色",
      seed: [ledgerEntry({ decisionKind: "proposal-accept" })],
      flowSteps: [STEP],
      payload: { roleId: "nominator", task: "x", flowId: FLOW, stepId: STEP },
      expectCode: /内置治理角色/,
    },
    {
      name: "无已接受提案",
      seed: [],
      flowSteps: [STEP],
      payload: { roleId: "A", task: "x", flowId: FLOW, stepId: STEP },
      expectCode: /尚无客户提案决定|提案/,
    },
    {
      name: "目标不在任命名单",
      seed: [
        ledgerEntry({ decisionKind: "proposal-accept" }),
        ledgerEntry({
          actorRoleId: "nominator",
          power: "nomination",
          decisionKind: "appointment",
          customerDecision: "appointed",
          targetRoleIds: ["B"],
        }),
      ],
      flowSteps: [STEP],
      payload: { roleId: "A", task: "x", flowId: FLOW, stepId: STEP },
      expectCode: /任命名单|任命/,
    },
    {
      name: "缺 flowId",
      seed: [ledgerEntry({ decisionKind: "proposal-accept" })],
      flowSteps: [STEP],
      payload: { roleId: "A", task: "x", stepId: STEP },
      expectCode: /flowId/,
    },
    {
      name: "缺 stepId",
      seed: [ledgerEntry({ decisionKind: "proposal-accept" })],
      flowSteps: [STEP],
      payload: { roleId: "A", task: "x", flowId: FLOW },
      expectCode: /stepId/,
    },
    {
      name: "流程单缺步骤",
      seed: [
        ledgerEntry({ decisionKind: "proposal-accept" }),
        ledgerEntry({
          actorRoleId: "nominator",
          power: "nomination",
          decisionKind: "appointment",
          customerDecision: "appointed",
          targetRoleIds: ["A"],
        }),
      ],
      flowSteps: ["other"],
      payload: { roleId: "A", task: "x", flowId: FLOW, stepId: STEP },
      expectCode: /没有步骤/,
    },
    {
      name: "重复派发（账本已有 dispatch.accepted）",
      seed: [
        ledgerEntry({ decisionKind: "proposal-accept" }),
        ledgerEntry({
          actorRoleId: "nominator",
          power: "nomination",
          decisionKind: "appointment",
          customerDecision: "appointed",
          targetRoleIds: ["A"],
        }),
        ledgerEntry({
          kind: "dispatch.accepted",
          actorRoleId: "convener",
          power: "schedule",
          stepId: STEP,
          targetRoleId: "A",
        }),
      ],
      flowSteps: [STEP],
      payload: { roleId: "A", task: "x", flowId: FLOW, stepId: STEP },
      expectCode: /已派发|去重/,
    },
    {
      name: "快捷路径：accept-quick + 既有项目角色",
      seed: [ledgerEntry({ decisionKind: "proposal-accept-quick", customerDecision: "accepted-quick" })],
      flowSteps: [STEP],
      payload: { roleId: "A", task: "quick", flowId: FLOW, stepId: STEP },
      expectCode: /./,
      allowed: true,
    },
  ];

  for (const s of scenarios) {
    const { root, cleanup } = makeRoot(`dispatch-${s.allowed === true ? "allow" : "deny"}`);
    try {
      writeProjectRole(root, "A");
      writeProjectRole(root, "B");
      write(root, `docs/flows/${FLOW}.md`, flowDoc(FLOW, s.flowSteps ?? []));
      // O2 门槛（2026-10-22）：已有 appointment 的 flow 派发前须先有结构合格的标准；先写标准，
      // 让各子场景仍测到其目标判定（步骤缺失/重复派发等），不改变门禁本身。
      write(root, `docs/acceptance/${FLOW}-criteria-v1.md`, ACCEPTANCE_CRITERIA_DOC);
      await seed(root, s.seed);
      const captured = capture();
      let called = 0;
      const handle = await openRoleSession(
        {
          roleId: "convener",
          project: trioProject(root),
          taskId: "T-dispatch",
          dispatchTask: async (payload) => {
            called += 1;
            return { ok: true, message: `stub 已派发 ${payload.roleId}` };
          },
        },
        { createAdapter: capturingFactory(captured) },
      );
      await consume(handle, "（验收空脚本）");
      await handle.dispose();
      const dispatch = captured.caps?.dispatchTask;
      assert.equal(typeof dispatch, "function", `${s.name}：Convener 应有 dispatchTask`);
      const receipt = (await dispatch!(s.payload as never)) as { ok: boolean; message: string };
      if (s.allowed === true) {
        assert.equal(receipt.ok, true, `${s.name}：应允许——${receipt.message}`);
        assert.equal(called, 1, `${s.name}：前端应收到一次派发`);
      } else {
        assert.equal(receipt.ok, false, `${s.name}：应拒投`);
        assert.match(receipt.message, /治理门禁/, `${s.name}：回执须如实说明门禁`);
        assert.match(receipt.message, s.expectCode, `${s.name}：${receipt.message}`);
        assert.equal(called, 0, `${s.name}：门禁拒绝不得进入前端路由`);
      }
    } finally {
      cleanup();
    }
  }
});

test("快捷路径边界：accept-quick 只能复用既有项目角色；目标无角色目录 ⇒ 拒（新建角色仍须任命+写盘确认）", async () => {
  const { root, cleanup } = makeRoot("quick-new-role");
  try {
    writeProjectRole(root, "A");
    write(root, `docs/flows/${FLOW}.md`, flowDoc(FLOW, [STEP]));
    await seed(root, [ledgerEntry({ decisionKind: "proposal-accept-quick", customerDecision: "accepted-quick" })]);
    const cap = capture();
    let called = 0;
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project: trioProject(root),
        taskId: "T-quick",
        dispatchTask: async () => {
          called += 1;
          return { ok: true, message: "stub" };
        },
      },
      { createAdapter: capturingFactory(cap) },
    );
    await consume(handle, "（验收空脚本）");
    await handle.dispose();
    const r = (await cap.caps!.dispatchTask!({ roleId: "C", task: "x", flowId: FLOW, stepId: STEP })) as { ok: boolean; message: string };
    assert.equal(r.ok, false);
    assert.match(r.message, /既有项目角色|角色目录/);
    assert.equal(called, 0, "无角色目录的快捷路径不得投递");
  } finally {
    cleanup();
  }
});

// —————————————————————— 2) 账本坏 fail-closed / append 失败不翻转 ——————————————————————

test("账本坏 fail-closed：坏行 ⇒ 门禁拒一切（含派发）；append 失败只如实回执、不放宽门禁", async () => {
  const { root, cleanup } = makeRoot("ledger-corrupt");
  try {
    writeProjectRole(root, "A");
    mkdirSync(`${root}/.ans/governance`, { recursive: true });
    write(root, ".ans/governance/ledger.jsonl", "{坏行\n");
    const read = await readGovernanceLedger(root);
    assert.ok(read.errors.length > 0, "坏行应产生 errors");
    for (const action of ["write-flow", "write-nomination", "write-role-card", "dispatch"] as const) {
      const decision = evaluateGovernanceGate(
        {
          projectRoot: root,
          model: "trio",
          roleId: action === "write-flow" || action === "dispatch" ? "convener" : "nominator",
          action,
          flowId: FLOW,
          stepId: STEP,
          targetRoleId: "A",
          path: `docs/${FLOW}.md`,
        },
        { entries: read.entries, errors: read.errors },
      );
      assert.equal(decision.allowed, false, `账本坏 ⇒ ${action} 必拒`);
      if (!decision.allowed) assert.equal(decision.code, "ledger-corrupt");
    }

    // append 失败（fsync 抛错）只如实返回，不抛；门禁快照仍按既有决定判定。
    const failed = await appendGovernanceLedger(
      root,
      ledgerEntry({ decisionKind: "proposal-accept" }),
      {
        openFile: async () => ({
          write: async () => {},
          sync: async () => {
            throw new Error("测试：fsync 失败");
          },
          close: async () => {},
        }),
      },
    );
    assert.equal(failed.ok, false, "append 失败应如实 ok:false");
    assert.match(failed.ok === false ? failed.message : "", /账本追加失败/);
    const allowed = evaluateGovernanceGate(
      { projectRoot: root, model: "trio", roleId: "convener", action: "write-flow", flowId: FLOW },
      { entries: [ledgerEntry({ decisionKind: "proposal-accept" })], errors: [] },
    );
    assert.equal(allowed.allowed, true, "append 失败不得放宽/改变既有客户决定（快照仍可放行）");
  } finally {
    cleanup();
  }
});

// —————————————————————— 3) 账本字段/顺序 + 完整 flow 还原 ——————————————————————

test("账本契约：customer.decision / artifact.observed / dispatch.accepted 字段与顺序；完整 flow 可还原谁提案/组队/排程/客户批了什么", async () => {
  const { root, cleanup } = makeRoot("ledger-e2e");
  try {
    writeProjectRole(root, "A");
    write(root, ".ans/project.json", JSON.stringify({ governanceModel: "trio" }) + "\n");
    const project = trioProject(root);

    // ① Rapporteur：写提案 → 客户接受。
    const rapporteurChannel = customerChannel({ selected: ["accept"], record: [] });
    const rHandle = await openGovernanceSession(
      { taskId: "T-r", project, governanceFunction: "proposal", customerInput: rapporteurChannel },
      {
        createAdapter: capturingFactory(capture(), {
          root,
          script: [
            { name: "write_file", args: { path: `docs/proposals/${FLOW}-v1.md`, content: proposalDoc(FLOW) } },
            {
              name: "request_choice",
              args: {
                title: `提案 ${FLOW}`,
                question: "是否接受？",
                flowId: FLOW,
                cardKind: "proposal",
                options: [
                  { id: "accept", label: "接受" },
                  { id: "reject", label: "拒绝" },
                ],
              },
            },
          ],
        }),
      },
    );
    await consume(rHandle, "请形成提案并请客户决定");
    await rHandle.dispose();

    const afterProposal = await waitForLedger(
      root,
      (entries) =>
        entries.some((e) => e.kind === "customer.decision" && e.decisionKind === "proposal-accept") &&
        entries.some((e) => e.kind === "artifact.observed" && e.artifactPath === `docs/proposals/${FLOW}-v1.md`),
    );
    const proposalSha = sha256(proposalDoc(FLOW));
    const decision = afterProposal.entries.find((e) => e.kind === "customer.decision");
    assert.ok(decision, "应有 customer.decision");
    assert.equal(decision!.flowId, FLOW);
    assert.equal(decision!.actorRoleId, "rapporteur");
    assert.equal(decision!.power, "proposal");
    assert.equal(decision!.decisionKind, "proposal-accept");
    assert.equal(decision!.customerDecision, "accepted");
    assert.equal(decision!.artifactPath, `docs/proposals/${FLOW}-v1.md`);
    assert.equal(decision!.artifactVersion, 1);
    assert.equal(decision!.artifactSha256, proposalSha);
    assert.equal(decision!.decisionEvidence?.kind, "customer-input");
    const proposalSeen = afterProposal.entries.find(
      (e) => e.kind === "artifact.observed" && e.artifactPath === `docs/proposals/${FLOW}-v1.md`,
    );
    assert.ok(proposalSeen, "应有 artifact.observed（提案）");
    assert.equal(proposalSeen!.actorRoleId, "rapporteur");
    assert.equal(proposalSeen!.power, "proposal");
    assert.equal(proposalSeen!.artifactVersion, 1);
    assert.equal(proposalSeen!.artifactSha256, proposalSha);
    assert.ok(
      afterProposal.entries.findIndex((e) => e === decision) <
        afterProposal.entries.findIndex((e) => e === proposalSeen),
      "顺序：客户决定先于该候选物的 settle 观察",
    );

    // ② Convener：写流程单（须已接受提案）→ artifact.observed。
    const cHandle = await openGovernanceSession(
      { taskId: "T-c", project, governanceFunction: "schedule" },
      {
        createAdapter: capturingFactory(capture(), {
          root,
          script: [{ name: "write_file", args: { path: `docs/flows/${FLOW}.md`, content: flowDoc(FLOW, [STEP]) } }],
        }),
      },
    );
    await consume(cHandle, "请安排流程");
    await cHandle.dispose();
    const afterFlow = await waitForLedger(
      root,
      (entries) => entries.some((e) => e.kind === "artifact.observed" && e.artifactPath === `docs/flows/${FLOW}.md`),
    );
    const flowSeen = afterFlow.entries.find(
      (e) => e.kind === "artifact.observed" && e.artifactPath === `docs/flows/${FLOW}.md`,
    );
    assert.ok(flowSeen, "应有流程单 artifact.observed");
    assert.equal(flowSeen!.actorRoleId, "convener");
    assert.equal(flowSeen!.power, "schedule");
    assert.equal(flowSeen!.flowId, FLOW);

    // ③ Convener：写团队计划 + 发起任命卡 → 客户任命 A（2026-10-22 第 1 项：任命卡归 Convener）。
    const c2Handle = await openGovernanceSession(
      { taskId: "T-c2", project, governanceFunction: "schedule", customerInput: customerChannel({ selected: ["A"], record: [] }) },
      {
        createAdapter: capturingFactory(capture(), {
          root,
          script: [
            { name: "write_file", args: { path: TEAM_PLAN_REL, content: TEAM_PLAN_DOC } },
            {
              name: "request_choice",
              args: {
                title: `任命 ${FLOW}`,
                question: "选择要任命的角色",
                flowId: FLOW,
                cardKind: "appointment",
                multiple: true,
                options: [{ id: "A", label: "A" }],
              },
            },
          ],
        }),
      },
    );
    await consume(c2Handle, "请依团队计划请客户任命");
    await c2Handle.dispose();
    const afterAppointment = await waitForLedger(
      root,
      (entries) =>
        entries.some((e) => e.decisionKind === "appointment") &&
        entries.some((e) => e.kind === "artifact.observed" && e.artifactPath === TEAM_PLAN_REL),
    );
    const appointment = afterAppointment.entries.find((e) => e.decisionKind === "appointment");
    assert.ok(appointment, "应有任命 customer.decision");
    assert.equal(appointment!.actorRoleId, "convener", "任命卡由 Convener 发起（第 1 项）");
    assert.equal(appointment!.power, "schedule", "appointment 的 power 由 Convener 职能决定（schedule）");
    assert.deepEqual(appointment!.targetRoleIds, ["A"]);
    assert.equal(appointment!.artifactPath, TEAM_PLAN_REL, "appointment 决定绑定团队计划路径");
    assert.equal(appointment!.artifactVersion, 1);
    assert.equal(typeof appointment!.artifactSha256, "string");
    const planSeen = afterAppointment.entries.find(
      (e) => e.kind === "artifact.observed" && e.artifactPath === TEAM_PLAN_REL,
    );
    assert.ok(planSeen, "应有团队计划 artifact.observed");
    assert.equal(planSeen!.actorRoleId, "convener", "谁组队/写团队计划 = Convener");
    assert.equal(planSeen!.power, "schedule");
    // 团队计划不在 `docs/proposals|nominations` 的 `-vN` 观察口径内：artifact.observed 只带路径/哈希。

    // 2026-10-22 第 3 项/O2：派发前先有结构合格的标准（由 Proof / 验收写；此处只作为派发前置）。
    write(root, `docs/acceptance/${FLOW}-criteria-v1.md`, ACCEPTANCE_CRITERIA_DOC);

    // ④ Crew（Nominator）：按任命名单写卡（appointment-write → role-card）。
    const nChannel = customerChannel({ selected: ["A"], confirmed: true, record: [] });
    const nHandle = await openGovernanceSession(
      { taskId: "T-n", project, governanceFunction: "nomination", customerInput: nChannel },
      {
        createAdapter: capturingFactory(capture(), {
          root,
          script: [
            {
              name: "request_confirmation",
              args: {
                title: `写盘确认 ${FLOW}`,
                // 2026-10-19 呈现前完整性闸：每条声明路径后都给出可核对正文。
                preview: "## 角色卡/A/role-card.md\n\n角色卡正文：角色名 A、职责与工作立场。\n",
                flowId: FLOW,
                cardKind: "appointment-write",
              },
            },
            { name: "write_file", args: { path: "角色卡/A/role-card.md", content: "# 角色：A\n\n由 Crew 写出。\n" } },
          ],
        }),
      },
    );
    await consume(nHandle, "请按任命名单写卡");
    await nHandle.dispose();
    const afterCrew = await waitForLedger(
      root,
      (entries) => entries.some((e) => e.decisionKind === "appointment-write"),
    );
    const writeConfirm = afterCrew.entries.find((e) => e.decisionKind === "appointment-write");
    assert.ok(writeConfirm, "应有写盘确认 customer.decision");
    assert.equal(writeConfirm!.actorRoleId, "nominator");
    assert.equal(writeConfirm!.power, "nomination");
    assert.ok((writeConfirm!.paths ?? []).includes("角色卡/A/role-card.md"), "写盘确认应逐条记路径");

    // ⑤ Convener 派发（真实桌面 routeDispatch）→ dispatch.accepted。
    const listing = await listProject(root);
    assert.equal(listing.governanceModel, "trio");
    const captured = new Map<string, ReturnType<typeof capture>>();
    const mgr = new SessionManager({
      openRoleSession: async (input) =>
        openRoleSession(
          {
            roleId: input.roleId,
            project: input.project,
            taskId: "T-desk",
            ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
            ...(input.customerInput !== undefined ? { customerInput: input.customerInput } : {}),
            ...(input.dispatchTask !== undefined ? { dispatchTask: input.dispatchTask } : {}),
            ...(input.shellOperatorOnly !== undefined ? { shellOperatorOnly: input.shellOperatorOnly } : {}),
            ...(input.shellReadonly !== undefined ? { shellReadonly: input.shellReadonly } : {}),
          },
          {
            createAdapter: (gate, caps) => {
              const c = capture();
              c.gate = gate;
              c.caps = caps;
              captured.set(input.roleId, c);
              return createFakeRuntimeAdapter({
                gate,
                script: [],
                ...(caps?.customerInput !== undefined ? { customerInput: caps.customerInput } : {}),
              });
            },
          },
        ),
      createPiAdapterFactory: () => () => {
        throw new Error("not used");
      },
      createDemoAdapter: () => {
        throw new Error("not used");
      },
      buildProjectConfig,
      getListing: (r) => (r === root ? listing : undefined),
      emitEvent: () => {},
    });
    const opened = (await mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" })) as OpenResult;
    assert.equal(opened.ok, true, opened.error ?? "");
    const dispatch = captured.get("convener")?.caps?.dispatchTask;
    assert.equal(typeof dispatch, "function");
    const receipt = (await dispatch!({ roleId: "A", task: "实现 impl", flowId: FLOW, stepId: STEP })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(receipt.ok, true, receipt.message);
    await mgr.stop(null);

    const final = await waitForLedger(root, (entries) => entries.some((e) => e.kind === "dispatch.accepted"));
    const dispatched = final.entries.find((e) => e.kind === "dispatch.accepted");
    assert.ok(dispatched, "成功派发后应写 dispatch.accepted");
    assert.equal(dispatched!.flowId, FLOW);
    assert.equal(dispatched!.stepId, STEP);
    assert.equal(dispatched!.actorRoleId, "convener");
    assert.equal(dispatched!.power, "schedule");
    assert.equal(dispatched!.targetRoleId, "A");
    assert.equal(dispatched!.runtime, "demo");
    assert.ok((dispatched!.messageSummary ?? "").length <= 200, "messageSummary ≤200 字");

    // ⑥ 可还原性：谁提案 / 谁组队（团队计划） / 谁排程 / 客户批了什么。
    const entries = final.entries;
    const proposer = entries.find((e) => e.kind === "artifact.observed" && e.artifactPath === `docs/proposals/${FLOW}-v1.md`);
    assert.equal(proposer?.actorRoleId, "rapporteur");
    // 2026-10-22 第 1 项：团队判断/团队计划归 Convener（原「谁提名 = Nominator」改为「谁组队/写团队计划」）。
    const teamPlanner = entries.find((e) => e.kind === "artifact.observed" && e.artifactPath === TEAM_PLAN_REL);
    assert.equal(teamPlanner?.actorRoleId, "convener", "谁组队/写团队计划 = Convener");
    const scheduler = entries.find((e) => e.kind === "artifact.observed" && e.artifactPath === `docs/flows/${FLOW}.md`);
    assert.equal(scheduler?.actorRoleId, "convener");
    assert.ok(entries.some((e) => e.kind === "dispatch.accepted" && e.actorRoleId === "convener"));
    const customerApprovals = entries.filter((e) => e.kind === "customer.decision");
    assert.ok(customerApprovals.some((e) => e.decisionKind === "proposal-accept"));
    assert.ok(customerApprovals.some((e) => e.decisionKind === "appointment" && (e.targetRoleIds ?? []).includes("A")));
    assert.ok(
      customerApprovals.every((e) => e.decisionEvidence?.kind === "customer-input"),
      "客户决定一律带应用签发的证据（不是角色自述）",
    );
  } finally {
    cleanup();
  }
});

// —————————————————————— 4) 一项目一待决定（队列） ——————————————————————

test("一项目一待决定：第二张卡不呈现、第一张结束后呈现；取消/超时清队；绝不自动批准", async () => {
  const presented: string[] = [];
  const queued: Array<{ id: string; waitingFor: string }> = [];
  const expired: string[] = [];
  const channel = createCustomerInputChannel({
    operatorId: "test:op",
    presenter: (p) => presented.push(p.id),
    onQueued: (p, waitingFor) => queued.push({ id: p.id, waitingFor }),
    onExpired: (p) => expired.push(p.id),
    nextId: (() => {
      let i = 0;
      return () => `op-${++i}`;
    })(),
  });
  const ctx = { roleId: "rapporteur", projectRoot: "/proj-one" };
  const reqConfirm = (title: string) => ({ kind: "confirm" as const, title, preview: "x" });
  const reqChoice = (title: string) => ({
    kind: "choice" as const,
    title,
    options: [{ id: "accept", label: "接受" }],
  });

  const first = channel.customerInput(reqConfirm("第一张"), ctx);
  const second = channel.customerInput(reqChoice("第二张"), ctx);
  await Promise.resolve();
  assert.deepEqual(presented, ["op-1"], "只呈现第一张");
  assert.deepEqual(queued, [{ id: "op-2", waitingFor: "op-1" }], "第二张入队并显示等待前一个决定");
  assert.equal(channel.pendingCount(), 2);
  assert.equal(channel.queuedCount(), 1);

  // 不自动批准：没有 respond 时，两张 promises 都不 settle。
  const sentinel = Symbol("pending");
  const raced = await Promise.race([
    first,
    new Promise<typeof sentinel>((resolve) => setTimeout(() => resolve(sentinel), 20)),
  ]);
  assert.equal(raced, sentinel, "等待不设限：未作答不自动批准、不超时");

  assert.equal(channel.respond({ id: "op-1", decision: { kind: "confirm", confirmed: true } }).ok, true);
  const firstOutcome = await first;
  assert.equal(firstOutcome?.outcome, "answered");
  assert.deepEqual(presented, ["op-1", "op-2"], "第一张结束后按序呈现第二张");
  assert.equal(channel.queuedCount(), 0);

  assert.equal(channel.respond({ id: "op-2", decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  assert.equal((await second)?.outcome, "answered");

  // 取消/失效：queued 项被 abort ⇒ 出队、resolve unavailable、onExpired；active 项仍待答。
  const active = channel.customerInput(reqConfirm("第三张"), ctx);
  const controller = new AbortController();
  const fourth = channel.customerInput(reqConfirm("第四张"), { ...ctx, sessionSignal: controller.signal });
  await Promise.resolve();
  assert.equal(channel.queuedCount(), 1);
  controller.abort();
  assert.equal((await fourth)?.outcome, "unavailable", "排队项取消 ⇒ unavailable（不呈现、不自动批准）");
  assert.ok(expired.includes("op-4"), "排队项失效应通知界面清队列");
  assert.equal(channel.queuedCount(), 0);
  assert.equal(channel.pendingCount(), 1, "已呈现的那张仍待答");
  channel.respond({ id: "op-3", decision: { kind: "confirm", confirmed: false } });
  assert.equal((await active)?.outcome, "declined");

  // 窗关清帐：active + queued 全部 declined，队列清空。
  const a = channel.customerInput(reqConfirm("第五张"), ctx);
  const b = channel.customerInput(reqConfirm("第六张"), ctx);
  await Promise.resolve();
  channel.rejectAllPending("窗口已关");
  assert.equal((await a)?.outcome, "declined");
  assert.equal((await b)?.outcome, "declined");
  assert.equal(channel.pendingCount(), 0);
  assert.equal(channel.queuedCount(), 0);
});
