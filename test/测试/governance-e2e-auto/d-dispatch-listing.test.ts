// test/测试/governance-e2e-auto/d-dispatch-listing.test.ts
// 场景 4（离线端到端）：**派发**——`role_status` / `dispatch_task` 能看到新角色；
// 未任命 / 未写卡时派发被拒；写卡后派发受理，账本 `dispatch.accepted`（app 与 convener 两类）。
//
// 通过真实桌面 Interface 打开 Convener 会话，拿到真实注入的 `roleStatus`/`dispatchTask` 能力
// （不是自造替身）；listing 缓存由桌面真实刷新。

import test from "node:test";
import assert from "node:assert/strict";

import {
  FLOW,
  FLOW_REL,
  flowDoc,
  makeHarness,
  makeRoot,
  seedLedger,
  seedTrioProject,
  write,
  writeProjectRole,
} from "./fixture.ts";

const ROLE_CARD_REL = "角色卡/executor/role-card.md";
const ROLE_BOUNDARY_REL = "角色卡/executor/boundary.yaml";

test("场景4：未任命/未写卡拒绝派发；role_status 刷新后可见新角色；写卡后派发受理并双类账本", async () => {
  const temp = makeRoot("dispatch-listing");
  seedTrioProject(temp.root, ["worker"]);
  write(temp.root, FLOW_REL, flowDoc(FLOW, [{ id: "impl", status: "pending" }, { id: "work", status: "pending" }]));
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

    // ③ 写卡（模拟 Nominator 的 appointment-write 落盘）+ 任命决定。
    write(temp.root, ROLE_CARD_REL, "# 角色：executor\n");
    write(
      temp.root,
      ROLE_BOUNDARY_REL,
      "role: executor\nentries:\n  - kind: directory\n    path: src/owned-executor/\n    purpose: 角色代码\n",
    );
    await seedLedger(temp.root, [
      {
        decisionKind: "appointment",
        customerDecision: "appointed",
        actorRoleId: "nominator",
        power: "nomination",
        targetRoleIds: ["executor"],
      },
    ]);

    // 应用推进（app 动作）：任命卡后派 Convener → 账本 dispatch.accepted(app)。
    const advancing = await h.iface.advanceGovernanceFlow({
      payload: { version: 1, flowId: FLOW, cardKind: "appointment", nextFunction: "schedule", roleId: "convener" },
      context: { sourceRoleId: "nominator", projectRoot: temp.root, runtime: "claude", targetRoleIds: ["executor"] },
    });
    assert.equal(advancing.ok, true, advancing.error ?? "");
    assert.equal(advancing.dispatched, true);

    // role_status miss 时强制刷新一次 ⇒ 新角色可见（不再误报未枚举）。
    const afterStatus = (await caps!.roleStatus!({ roleId: "executor" })) as { ok: boolean; text: string };
    assert.match(afterStatus.text, /角色 executor：busy=/, "listing 刷新后 role_status 可见 executor");
    assert.doesNotMatch(afterStatus.text, /executor：不在本项目/);
    const listing = await h.iface.listProject({ projectRoot: temp.root });
    assert.equal(listing.roles.some((role) => role.roleId === "executor"), true, "左树 listing 可枚举 executor");

    // ④ 写卡 + 任命后派发受理（Convener 的 dispatch_task）。
    const receipt = (await caps!.dispatchTask!({ roleId: "executor", task: "执行 impl", flowId: FLOW, stepId: "impl" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(receipt.ok, true, receipt.message);
    assert.match(receipt.message, /已受理|已接收/);
    await h.waitFor(() => h.openRoles.includes("executor"), 3000);
    assert.ok(h.openRoles.includes("executor"), "派发应自动开启目标项目角色会话");

    // ⑤ 账本：app 推进 + convener 派发各一条，字段如实。
    const ledger = await h.waitForLedger(
      (entries) =>
        entries.some((entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "app") &&
        entries.some((entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "convener"),
      5000,
    );
    const appEntry = ledger.entries.find((entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "app");
    assert.ok(appEntry, "账本应有 dispatch.accepted(app)");
    assert.equal(appEntry!.power, "app");
    assert.equal(appEntry!.trigger, "customer-decision");
    assert.equal(appEntry!.targetRoleId, "convener");
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
