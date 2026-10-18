// test/测试/governance-e2e-auto/c-appointment-timing.test.ts
// 场景 3（离线端到端）：**任命后的时序**——appointment（targetRoleIds=["executor"]）但
// `角色卡/executor/` 不存在 ⇒ 不得派 Convener；应后台派 Nominator 完成 `appointment-write`；
// 写卡后 listing 刷新、executor 可枚举，才派 Convener。
//
// 任命卡/写盘卡都由真实客户通道 + 判断 driver 产生（假判断会话交回 approve）；
// 桌面 Interface 走真实 listing 缓存刷新与 `advanceGovernanceFlow`。

import test from "node:test";
import assert from "node:assert/strict";

import { listProject } from "../../../src/service/role/resolve-role.ts";
import {
  FLOW,
  FLOW_REL,
  NOMINATION_REL,
  exists,
  flowDoc,
  makeHarness,
  makeRoot,
  nominationDoc,
  seedLedger,
  seedTrioProject,
  write,
  type ScriptContext,
} from "./fixture.ts";

const ROLE_CARD_REL = "角色卡/executor/role-card.md";
const ROLE_BOUNDARY_REL = "角色卡/executor/boundary.yaml";

test("场景3：任命后角色未写出 ⇒ 先派 Nominator 写卡；写卡后可枚举才派 Convener", async () => {
  const temp = makeRoot("appointment-timing");
  seedTrioProject(temp.root);
  // 前置：流程单已由 Convener 写出（accept 两段式第一段）。
  write(temp.root, FLOW_REL, flowDoc(FLOW, [{ id: "impl", status: "pending" }]));
  // 前置：提案已被客户接受（写提名文件的前置门禁）。
  await seedLedger(temp.root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
  ]);

  const convenerSnapshots: Array<{ filesExist: boolean; listed: boolean }> = [];
  const h = await makeHarness({
    tag: "appointment-timing",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId === "nominator") {
        const writeCardTask = /尚未写出|appointment-write|写卡/.test(ctx.prompt);
        if (writeCardTask) {
          return [
            {
              name: "request_confirmation",
              toolCallId: "tc-appointment-write",
              args: {
                title: `写盘确认 ${FLOW}`,
                preview: `将写入：\n- ${ROLE_CARD_REL}\n- ${ROLE_BOUNDARY_REL}\n\n# 角色：executor\n`,
                flowId: FLOW,
                cardKind: "appointment-write",
              },
            },
            { name: "write_file", args: { path: ROLE_CARD_REL, content: "# 角色：executor\n\n由 Nominator 写出。\n" } },
            {
              name: "write_file",
              args: {
                path: ROLE_BOUNDARY_REL,
                content: "role: executor\nentries:\n  - kind: directory\n    path: src/owned-executor/\n    purpose: 角色代码\n",
              },
            },
          ];
        }
        return [
          { name: "write_file", args: { path: NOMINATION_REL, content: nominationDoc(FLOW, ["executor"]) } },
          {
            name: "request_choice",
            toolCallId: "tc-appointment",
            args: {
              title: `任命 ${FLOW}`,
              question: "选择要任命的角色",
              flowId: FLOW,
              cardKind: "appointment",
              multiple: true,
              options: [{ id: "executor", label: "Executor" }],
            },
          },
        ];
      }
      return [];
    },
    onPrompt: async (ctx) => {
      if (ctx.roleId === "convener") {
        const listing = await listProject(temp.root);
        convenerSnapshots.push({
          filesExist: exists(temp.root, ROLE_CARD_REL) && exists(temp.root, ROLE_BOUNDARY_REL),
          listed: listing.roles.some((role) => role.roleId === "executor"),
        });
      }
    },
  });
  try {
    await h.open("nominator");
    const sent = await h.send("nominator", "请提名 executor 并请客户任命。");
    assert.equal(sent.ok, true, sent.error ?? "");

    await h.waitFor(() => h.advanceResults.length === 1, 8000);
    const result = await h.advanceResults[0]!;
    assert.equal(result.ok, true, result.error ?? "");
    assert.equal(result.dispatched, true);
    assert.equal(result.targetRoleId, "nominator", "第一段是 Nominator 写卡");
    assert.equal(result.followUpRoleId, "convener", "写卡完成后才派 Convener");

    // 写卡期间绝不派 Convener：Convener 第一次收到任务时角色卡已存在且已可枚举。
    assert.equal(h.prompts.get("convener")?.length, 1, "Convener 最终恰收到一条排程任务");
    assert.match(h.prompts.get("convener")![0]!, /客户已完成任命 executor/);
    assert.deepEqual(convenerSnapshots, [{ filesExist: true, listed: true }], "派 Convener 时 executor 必须已写出且已枚举");

    // 写卡任务先于 Convener：任务文案带 appointment-write，且文件真实落盘。
    const nominatorPrompts = h.prompts.get("nominator") ?? [];
    assert.equal(nominatorPrompts.length, 2, "Nominator 先提名、后写卡（同会话两轮）");
    assert.match(nominatorPrompts[1]!, /appointment-write/);
    assert.equal(exists(temp.root, ROLE_CARD_REL), true);
    assert.equal(exists(temp.root, ROLE_BOUNDARY_REL), true);

    // listing 刷新：界面枚举可见 executor；治理角色 settle 触发 project:changed。
    const listing = await h.iface.listProject({ projectRoot: temp.root });
    assert.equal(listing.roles.some((role) => role.roleId === "executor"), true, "左树 listing 刷新后 executor 可枚举");
    assert.ok(h.projectChanged > 0, "治理角色 settle 后 emitProjectChanged（渲染侧重取左树）");

    // 账本：任命/写卡决定都是 judge 证据；两段 app 派发先后有序。
    const ledger = await h.waitForLedger(
      (entries) => entries.filter((entry) => entry.kind === "dispatch.accepted").length >= 2,
      8000,
    );
    const appointment = ledger.entries.find((entry) => entry.decisionKind === "appointment");
    assert.ok(appointment, "应有任命决定");
    assert.equal(appointment!.decisionEvidence?.kind, "judge");
    assert.deepEqual(appointment!.targetRoleIds, ["executor"]);
    const appointmentWrite = ledger.entries.find((entry) => entry.decisionKind === "appointment-write");
    assert.ok(appointmentWrite, "应有 appointment-write 写盘确认");
    assert.equal(appointmentWrite!.decisionEvidence?.kind, "judge");
    assert.deepEqual(appointmentWrite!.paths?.sort(), [ROLE_BOUNDARY_REL, ROLE_CARD_REL].sort());

    const accepted = ledger.entries.filter((entry) => entry.kind === "dispatch.accepted");
    assert.deepEqual(
      accepted.map((entry) => [entry.actorRoleId, entry.trigger, entry.targetRoleId]),
      [
        ["app", "customer-decision", "nominator"],
        ["app", "customer-decision", "convener"],
      ],
      "账本 dispatch.accepted(app)：先写卡、后 Convener",
    );

    assert.equal(h.presented.length, 0, "双开关开 + 判断 allow ⇒ 0 张手动卡");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("场景3b：写卡始终未写出 ⇒ 不派 Convener、如实报错、不循环", async () => {
  const temp = makeRoot("appointment-timing-missing");
  seedTrioProject(temp.root);
  // 前置：提案已被客户接受（写提名文件的前置门禁）。
  await seedLedger(temp.root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
  ]);
  const h = await makeHarness({
    tag: "appointment-timing-missing",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx: ScriptContext) => {
      if (ctx.roleId === "nominator") {
        if (/尚未写出|appointment-write|写卡/.test(ctx.prompt)) return []; // 模拟写卡失败/未写
        return [
          { name: "write_file", args: { path: NOMINATION_REL, content: nominationDoc(FLOW, ["executor"]) } },
          {
            name: "request_choice",
            toolCallId: "tc-appointment",
            args: {
              title: `任命 ${FLOW}`,
              flowId: FLOW,
              cardKind: "appointment",
              multiple: true,
              options: [{ id: "executor", label: "Executor" }],
            },
          },
        ];
      }
      return [];
    },
  });
  try {
    await h.open("nominator");
    await h.send("nominator", "请提名 executor 并请客户任命。");
    await h.waitFor(() => h.advanceResults.length === 1, 8000);
    const result = await h.advanceResults[0]!;
    assert.equal(result.ok, false);
    assert.equal(result.dispatched, true, "写卡任务已投递");
    assert.equal(result.targetRoleId, "nominator");
    assert.match(result.error ?? "", /角色卡\/边界仍未写出（executor 未枚举到）/);
    assert.equal(h.prompts.get("convener")?.length ?? 0, 0, "角色未写出时绝不派 Convener");
    assert.equal(h.openRoles.includes("convener"), false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(h.prompts.get("nominator")?.length, 2, "只派一次写卡任务，不循环");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
