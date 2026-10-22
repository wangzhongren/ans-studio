// test/测试/governance-e2e-auto/d-dispatch-listing.test.ts
// 场景 4（离线端到端）：**派发**——`role_status` / `dispatch_task` 能看到新角色；
// 未任命 / 未写卡 / 缺实施前标准时派发被拒；写卡+标准齐备后派发受理，账本 `dispatch.accepted`（app 与 convener 两类）。
//
// 2026-10-22 第 1/3 项（客户确认方案）更新：
//   · 任命决定后应用派 **Crew 写卡**（role-cards），不是 Convener 排程；
//   · 已有 appointment 的 flow，派发项目角色前必须有结构合格的实施前验收标准（O2 硬门槛）。
// 旧断言「任命后派 Convener」与新分工冲突，已按新方案更新；「未任命/未写卡拒绝」强度保留并新增 O2 门槛负例。

import test from "node:test";
import assert from "node:assert/strict";

import {
  CRITERIA_REL,
  FLOW,
  FLOW_REL,
  TEAM_PLAN_REL,
  acceptanceCriteriaDoc,
  flowDoc,
  makeHarness,
  makeRoot,
  seedLedger,
  seedTrioProject,
  teamPlanDoc,
  write,
  writeProjectRole,
} from "./fixture.ts";

const ROLE_CARD_REL = "角色卡/executor/role-card.md";
const ROLE_BOUNDARY_REL = "角色卡/executor/boundary.yaml";

test("场景4：未任命/未写卡/缺标准拒绝派发；role_status 刷新后可见新角色；写卡+标准后派发受理并双类账本", async () => {
  const temp = makeRoot("dispatch-listing");
  seedTrioProject(temp.root, ["worker"]);
  write(temp.root, FLOW_REL, flowDoc(FLOW, [{ id: "impl", status: "pending" }, { id: "work", status: "pending" }]));
  // 团队计划：executor 为 existing（只做最低结构检查，迁移策略），供任命后应用派 Crew 写卡使用。
  write(temp.root, TEAM_PLAN_REL, teamPlanDoc(FLOW, ["executor"], { rowOverrides: { executor: { type: "existing" } } }));
  // 已接受提案；尚无任命。
  await seedLedger(temp.root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
  ]);

  const h = await makeHarness({ tag: "dispatch-listing", root: temp.root, approval: true, decision: true });
  try {
    await h.open("convener");
    const caps = h.capsByRole.get("convener");
    assert.ok(caps?.roleStatus, "Convener 应注入 role_status");
    assert.ok(caps?.dispatchTask, "Convener 应注入 dispatch_task");

    // ① 未任命：目标角色存在（worker），但账本没有任命决定 ⇒ 治理门禁拒绝。
    const unappointed = (await caps!.dispatchTask!({ roleId: "worker", task: "执行 work", flowId: FLOW, stepId: "work" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(unappointed.ok, false, "未任命不得派发");
    assert.match(unappointed.message, /治理门禁/);
    assert.match(unappointed.message, /任命/);

    // ② 未写卡：executor 不存在于 listing ⇒ 拒绝，且错误指向「不在本项目」。
    const beforeStatus = (await caps!.roleStatus!({ roleId: "executor" })) as { ok: boolean; text: string };
    assert.equal(beforeStatus.ok, true);
    assert.match(beforeStatus.text, /角色 executor：不在本项目/);
    const missing = (await caps!.dispatchTask!({ roleId: "executor", task: "执行 impl", flowId: FLOW, stepId: "impl" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(missing.ok, false, "未写卡不得派发");
    assert.match(missing.message, /不在本项目/);

    // ③ 写卡（模拟 Crew 的 appointment-write 落盘）+ 任命决定。
    writeProjectRole(temp.root, "executor");
    await seedLedger(temp.root, [
      {
        decisionKind: "appointment",
        customerDecision: "appointed",
        actorRoleId: "convener",
        power: "schedule",
        targetRoleIds: ["executor"],
        artifactPath: TEAM_PLAN_REL,
      },
    ]);

    // ④ 应用推进（app 动作）：任命后派 **Crew 写卡**（role-cards），不是 Convener。
    const advancing = await h.iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: FLOW, cardKind: "appointment", nextFunction: "role-card-write", roleId: "nominator" },
      context: { sourceRoleId: "convener", projectRoot: temp.root, runtime: "claude", targetRoleIds: ["executor"], teamPlanPath: TEAM_PLAN_REL },
    });
    assert.equal(advancing.ok, true, advancing.error ?? "");
    assert.equal(advancing.dispatched, true);
    assert.equal(advancing.targetRoleId, "nominator", "任命决定后派 Crew 写卡（不是 Convener）");
    await h.waitFor(() => h.openRoles.includes("nominator"), 3000);
    assert.ok(h.openRoles.includes("nominator"), "应后台打开 Crew 写卡会话");

    // role_status miss 时强制刷新一次 ⇒ 新角色可见（不再误报未枚举）。
    const afterStatus = (await caps!.roleStatus!({ roleId: "executor" })) as { ok: boolean; text: string };
    assert.match(afterStatus.text, /角色 executor：busy=/, "listing 刷新后 role_status 可见 executor");
    assert.doesNotMatch(afterStatus.text, /executor：不在本项目/);
    const listing = await h.iface.listProject({ projectRoot: temp.root });
    assert.equal(listing.roles.some((role) => role.roleId === "executor"), true, "左树 listing 可枚举 executor");

    // ⑤ O2 门槛负例：已有 appointment 的 flow，缺实施前标准 ⇒ 派发拒绝（不把「标准待补」当通过）。
    const noCriteria = (await caps!.dispatchTask!({ roleId: "executor", task: "执行 impl", flowId: FLOW, stepId: "impl" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(noCriteria.ok, false, "缺实施前标准不得派发");
    assert.match(noCriteria.message, /验收标准.*不存在|acceptance-criteria|实施前验收标准/);

    // ⑥ 补写结构合格的标准后派发受理（Convener 的 dispatch_task）。
    write(temp.root, CRITERIA_REL, acceptanceCriteriaDoc(FLOW));
    const receipt = (await caps!.dispatchTask!({ roleId: "executor", task: "执行 impl", flowId: FLOW, stepId: "impl" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(receipt.ok, true, receipt.message);
    assert.match(receipt.message, /已受理|已接收/);
    await h.waitFor(() => h.openRoles.includes("executor"), 3000);
    assert.ok(h.openRoles.includes("executor"), "派发应自动开启目标项目角色会话");

    // ⑦ 账本：app 推进（任命→Crew 写卡）+ convener 派发各一条，字段如实。
    const ledger = await h.waitForLedger(
      (entries) =>
        entries.some(
          (entry) =>
            entry.kind === "dispatch.accepted" &&
            entry.actorRoleId === "app" &&
            entry.targetRoleId === "nominator",
        ) &&
        entries.some((entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "convener"),
      5000,
    );
    const appEntry = ledger.entries.find(
      (entry) =>
        entry.kind === "dispatch.accepted" && entry.actorRoleId === "app" && entry.targetRoleId === "nominator",
    );
    assert.ok(appEntry, "账本应有 dispatch.accepted(app → nominator)");
    assert.equal(appEntry!.power, "app");
    assert.equal(appEntry!.trigger, "customer-decision");
    assert.equal(appEntry!.stepId, "role-cards");
    assert.equal(appEntry!.customerDecision, undefined, "应用推进不是客户批准");
    const convenerEntry = ledger.entries.find(
      (entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "convener",
    );
    assert.ok(convenerEntry, "账本应有 Convener 的 dispatch.accepted");
    assert.equal(convenerEntry!.power, "schedule");
    assert.equal(convenerEntry!.flowId, FLOW);
    assert.equal(convenerEntry!.stepId, "impl");
    assert.equal(convenerEntry!.targetRoleId, "executor");
    assert.equal(convenerEntry!.customerDecision, undefined);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
