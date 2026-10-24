// test/测试/governance-e2e-auto/d-dispatch-listing.test.ts
// 场景 4（离线端到端）：**派发**——`role_status` / `dispatch_task` 能看到新角色；
// 未任命 / 未写卡 / 缺实施前标准时派发被拒；写卡+标准齐备后派发受理，账本 `dispatch.accepted`（app 与 convener 两类）。
//
// 2026-10-22 第 1/3 项（客户确认方案）更新：
//   · 任命决定后应用派 **Crew 写卡**（role-cards），不是 Convener 排程；
//   · 已有 appointment 的 flow，派发项目角色前必须有结构合格的实施前验收标准（O2 硬门槛）。
// 旧断言「任命后派 Convener」与新分工冲突，已按新方案更新；「未任命/未写卡拒绝」强度保留并新增 O2 门槛负例。
//
// 2026-10-24 后续（P1-5/P1-7/P0-2）更新：
//   · P1-5：标准门**只对发布版本**（`release: true`）生效，读取 `<flowId>-criteria-vN.md` 最新版本；
//     非发布/legacy 豁免（场景 4c 正例、4d 版本矩阵）。场景 4 的 ⑤ 负例因此显式标 release。
//   · P1-7：`dispatched → delivered` 只能由步骤 owner（项目 worker）标记，Steward/Lead 不代标；
//     `delivered → done` 仅管理者（场景 4e）。
//   · P0-2：步骤 done 后后续 pending 变 ready ⇒ Steward 收到一条 `[自动推进]` 提示；应用不自动派发、
//     不写 flow/账本、不派 acceptance/Proof（场景 4e 同一链路）。

import test from "node:test";
import assert from "node:assert/strict";

import type { ToolCall } from "../../../src/model/runtime.ts";
import { parseFlowStateYaml } from "../../../src/pipeline/orchestration/flow-state.ts";
import {
  CRITERIA_REL,
  FLOW,
  FLOW_REL,
  TEAM_PLAN_REL,
  acceptanceCriteriaDoc,
  exists,
  flowDoc,
  makeHarness,
  makeRoot,
  read,
  seedLedger,
  seedTrioProject,
  teamPlanDoc,
  teamPlanV2Doc,
  write,
  writeProjectRole,
  type ScriptContext,
} from "./fixture.ts";

const ROLE_CARD_REL = "角色卡/executor/role-card.md";
const ROLE_BOUNDARY_REL = "角色卡/executor/boundary.yaml";

test("场景4：未任命/未写卡/缺标准拒绝派发；role_status 刷新后可见新角色；写卡+标准后派发受理并双类账本", async () => {
  const temp = makeRoot("dispatch-listing");
  seedTrioProject(temp.root, ["worker"]);
  // 2026-10-24 P1-5：验收标准门**只对发布版本**（`release: true`）生效；本场景 ⑤ 要验证「发布版本缺
  // 标准 ⇒ 拒」，故流程显式标 release（非发布豁免的正例见场景 4c）。
  write(
    temp.root,
    FLOW_REL,
    flowDoc(FLOW, [{ id: "impl", status: "pending" }, { id: "work", status: "pending" }], { release: true }),
  );
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

    // ⑤ O2 门槛负例（2026-10-24 P1-5）：发布版本（release: true）缺实施前标准 ⇒ 派发拒绝
    //（不把「标准待补」当通过；非发布版本由场景 4c 证明豁免）。
    const noCriteria = (await caps!.dispatchTask!({ roleId: "executor", task: "执行 impl", flowId: FLOW, stepId: "impl" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(noCriteria.ok, false, "发布版本缺实施前标准不得派发");
    assert.match(noCriteria.message, /发布版本（release: true）/);
    assert.match(noCriteria.message, new RegExp(`${FLOW}-criteria-vN\\.md 不存在或不可读`));

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

test("场景4b（v2）：Map 组可并行派发；listing/role_status 可见；Reduce 在全部 Map done 前被拒、done 后受理", async () => {
  const temp = makeRoot("dispatch-listing-v2");
  seedTrioProject(temp.root, ["executor", "reviewer", "tester"]);
  const v2Plan = teamPlanV2Doc(FLOW, {
    modules: ["storefront", "checkout-api"],
    recommended: ["executor", "reviewer"],
    rows: [
      { roleId: "executor", type: "new", module: "storefront", writes: "src/owned-executor/; test/owned-executor/", contract: "docs/contracts/storefront-v1.md", testSurface: "test/owned-executor/", dependsOn: "无", parallelGroup: "map-a", group: "交付" },
      { roleId: "reviewer", type: "new", module: "checkout-api", writes: "src/owned-reviewer/; test/owned-reviewer/", contract: "docs/contracts/checkout-v1.md", testSurface: "test/owned-reviewer/", dependsOn: "无", parallelGroup: "map-a", group: "交付" },
      { roleId: "tester", type: "existing", module: "reduce", writes: "test/测试/", contract: "docs/contracts/storefront-v1.md（消费）", testSurface: "test/测试/（集成/e2e）", deps: "依赖全部 Map", dependsOn: "executor, reviewer", parallelGroup: "reduce", group: "测试", apiSpec: "not-applicable（Reduce 不导出接口）" },
    ],
  });
  const flowPending = flowDoc(FLOW, [
    { id: "contract-freeze", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/storefront-v1.md" } },
    { id: "delivery-storefront", owner: "executor", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
    { id: "delivery-checkout-api", owner: "reviewer", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
    { id: "test-map-shards", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["delivery-storefront", "delivery-checkout-api"] },
    { id: "verification", kind: "acceptance", status: "pending" },
  ]);
  write(temp.root, FLOW_REL, flowPending);
  write(temp.root, TEAM_PLAN_REL, v2Plan);
  write(temp.root, CRITERIA_REL, acceptanceCriteriaDoc(FLOW));
  await seedLedger(temp.root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
    {
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleIds: ["executor", "reviewer", "tester"],
      artifactPath: TEAM_PLAN_REL,
    },
  ]);

  const h = await makeHarness({ tag: "dispatch-listing-v2", root: temp.root, approval: true, decision: true });
  try {
    await h.open("convener");
    const caps = h.capsByRole.get("convener")!;
    const listing = await h.iface.listProject({ projectRoot: temp.root });
    for (const roleId of ["executor", "reviewer", "tester"]) {
      assert.equal(listing.roles.some((role) => role.roleId === roleId), true, `listing 可见 ${roleId}`);
      const status = (await caps.roleStatus!({ roleId })) as { ok: boolean; text: string };
      assert.match(status.text, new RegExp(`角色 ${roleId}：busy=`));
    }

    const mapA = (await caps.dispatchTask!({ roleId: "executor", task: "Map A 交付", flowId: FLOW, stepId: "delivery-storefront" })) as { ok: boolean; message: string };
    const mapB = (await caps.dispatchTask!({ roleId: "reviewer", task: "Map A 交付", flowId: FLOW, stepId: "delivery-checkout-api" })) as { ok: boolean; message: string };
    assert.equal(mapA.ok, true, mapA.message);
    assert.equal(mapB.ok, true, mapB.message);

    const early = (await caps.dispatchTask!({ roleId: "tester", task: "Reduce 分片", flowId: FLOW, stepId: "test-map-shards" })) as { ok: boolean; message: string };
    assert.equal(early.ok, false, "Map 未 done 时 Reduce 不得派发");
    assert.match(early.message, /前置依赖尚未全部 done/);

    write(
      temp.root,
      FLOW_REL,
      flowDoc(FLOW, [
        { id: "contract-freeze", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/storefront-v1.md" } },
        { id: "delivery-storefront", owner: "executor", kind: "dispatch", status: "done", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
        { id: "delivery-checkout-api", owner: "reviewer", kind: "dispatch", status: "done", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
        { id: "test-map-shards", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["delivery-storefront", "delivery-checkout-api"] },
        { id: "verification", kind: "acceptance", status: "pending" },
      ]),
    );
    const reduce = (await caps.dispatchTask!({ roleId: "tester", task: "Reduce 分片", flowId: FLOW, stepId: "test-map-shards" })) as { ok: boolean; message: string };
    assert.equal(reduce.ok, true, reduce.message);
    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "test-map-shards"),
      5000,
    );
    assert.ok(ledger.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "delivery-storefront"));
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

// —————————————————————— 2026-10-24 P1-5：发布 criteria 最新版 / 非发布豁免 ——————————————————————

/** 派发前置账本（proposal-accept + appointment executor；与场景 4 同口径）。 */
async function seedAppointedLedger(root: string): Promise<void> {
  await seedLedger(root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
    {
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleIds: ["executor"],
      artifactPath: TEAM_PLAN_REL,
    },
  ]);
}

test("场景4c（P1-5）：非发布 flow 缺验收标准 ⇒ 豁免放行，不要求/不伪造 Verifier 文件", async () => {
  const temp = makeRoot("dispatch-non-release");
  seedTrioProject(temp.root, ["executor"]);
  // 非发布（flow YAML 无 release）：P1-5 下 criteria 门豁免——不需要 docs/acceptance/<flow>-criteria-*.md。
  write(temp.root, FLOW_REL, flowDoc(FLOW, [{ id: "impl", status: "pending" }]));
  write(temp.root, TEAM_PLAN_REL, teamPlanDoc(FLOW, ["executor"], { rowOverrides: { executor: { type: "existing" } } }));
  await seedAppointedLedger(temp.root);
  assert.equal(exists(temp.root, CRITERIA_REL), false, "前置：非发布 flow 没有验收标准文件");

  const h = await makeHarness({ tag: "dispatch-non-release", root: temp.root, approval: true, decision: true });
  try {
    await h.open("convener");
    const caps = h.capsByRole.get("convener")!;
    const receipt = (await caps.dispatchTask!({ roleId: "executor", task: "执行 impl", flowId: FLOW, stepId: "impl" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(receipt.ok, true, `非发布缺标准应豁免放行：${receipt.message}`);
    assert.match(receipt.message, /已受理|已接收/);
    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "impl"),
      5000,
    );
    assert.ok(
      ledger.entries.some(
        (entry) => entry.kind === "dispatch.accepted" && entry.stepId === "impl" && entry.targetRoleId === "executor",
      ),
      "非发布派发照常写 dispatch.accepted(executor)",
    );
    assert.equal(exists(temp.root, CRITERIA_REL), false, "非发布豁免不得伪造标准文件");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("场景4d（P1-5）：发布 flow 读取 criteria 最新版本——v1 坏/v2 好受理；v3 坏即使 v2 好也拒（不回退）", async () => {
  const temp = makeRoot("dispatch-criteria-latest");
  seedTrioProject(temp.root, ["executor"]);
  write(temp.root, FLOW_REL, flowDoc(FLOW, [{ id: "impl", status: "pending" }, { id: "work", status: "pending" }], { release: true }));
  write(temp.root, TEAM_PLAN_REL, teamPlanDoc(FLOW, ["executor"], { rowOverrides: { executor: { type: "existing" } } }));
  const v1Rel = `docs/acceptance/${FLOW}-criteria-v1.md`;
  const v2Rel = `docs/acceptance/${FLOW}-criteria-v2.md`;
  const v3Rel = `docs/acceptance/${FLOW}-criteria-v3.md`;
  write(temp.root, v1Rel, "# 旧版未结构化标准\n\n待补。\n"); // 结构不合格
  write(temp.root, v2Rel, acceptanceCriteriaDoc(FLOW).replace("version: 1", "version: 2")); // 结构合格
  await seedAppointedLedger(temp.root);

  const h = await makeHarness({ tag: "dispatch-criteria-latest", root: temp.root, approval: true, decision: true });
  try {
    await h.open("convener");
    const caps = h.capsByRole.get("convener")!;

    // v1 不合格、v2 最新且合格 ⇒ 受理（证明不再硬编码读取 v1）。
    const first = (await caps.dispatchTask!({ roleId: "executor", task: "执行 impl", flowId: FLOW, stepId: "impl" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(first.ok, true, `发布 flow 应读最新 v2 并放行：${first.message}`);
    assert.match(first.message, /已受理|已接收/);

    // v3 不合格（即使 v2 合格）⇒ 最新版本优先、不回退旧版本，拒绝派发。
    write(temp.root, v3Rel, "# v3 未结构化标准\n\n待补。\n");
    const second = (await caps.dispatchTask!({ roleId: "executor", task: "执行 work", flowId: FLOW, stepId: "work" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(second.ok, false, "最新版本结构不合格不得派发（不回退旧版本）");
    assert.match(second.message, /结构不合格/);
    assert.ok(second.message.includes(`${FLOW}-criteria-v3.md`), `拒绝文案须指向最新版本 v3：${second.message}`);

    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "impl"),
      5000,
    );
    assert.equal(
      ledger.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "work"),
      false,
      "被拒的 work 不得写 dispatch.accepted",
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

// —————————————————————— 2026-10-24 P1-7 + P0-2：owner delivered / manager 不代标 / 自动推进唤醒 ——————————————————————
//
// 真实桌面 Interface + run-role + flow-service + 账本；Draft（rapporteur，内置**非管理者**，power=proposal）
// 与 Steward（convener）的会话都是脚本桩，但 flow 工具调用走真实受治理工具与迁移/权限裁决。
// （项目 worker 的 delivered 路径由 `test/编排/flow-service.test.ts` 的 actorPower=project 用例覆盖；
// 桌面 fixture 不 pin 项目角色边界，无法直接开启项目角色会话，故此处用内置非管理者钉角色级裁决。）
// 链路：dispatched（已派发账本）→ owner（rapporteur）标 delivered（非管理者不能 done）→ manager
// 代标 delivered 被拒、核证 done 通过 → 后续 pending `work`（项目角色 executor）变 ready ⇒ Steward
// 收到一条 `[自动推进]` 提示；应用不自动派发 work、不派 acceptance/Proof、不写 flow/账本、不弹客户卡。

function flowRevisionFrom(message: string): string | undefined {
  return /revision=([0-9a-f]{64})/.exec(message)?.[1];
}

test("场景4e（P1-7/P0-2）：owner 标 delivered、manager 不代标；done 后后续 pending ready ⇒ Steward 收 [自动推进]，应用不自动派发/不写账本", async () => {
  const temp = makeRoot("dispatch-owner-delivered");
  seedTrioProject(temp.root, ["executor"]);
  write(
    temp.root,
    FLOW_REL,
    flowDoc(FLOW, [
      { id: "impl", owner: "rapporteur", kind: "dispatch", status: "dispatched" },
      { id: "work", owner: "executor", kind: "dispatch", status: "pending", dependsOn: ["impl"] },
      { id: "verification", kind: "acceptance", status: "pending" },
    ]),
  );
  await seedLedger(temp.root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
    {
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleIds: ["executor"],
    },
    // impl 已派发：done 证据对账的依据（dispatch 证据 ref=stepId 必须能在账本找到 dispatch.accepted）。
    { kind: "dispatch.accepted", actorRoleId: "convener", power: "schedule", targetRoleId: "rapporteur", stepId: "impl" },
  ]);

  let ownerRevision: string | undefined;
  let convenerRevision: string | undefined;
  const readMarker = "P1-7 读 revision";
  const scriptForRole = (ctx: ScriptContext): ToolCall[] => {
    if ((ctx.roleId === "rapporteur" || ctx.roleId === "convener") && ctx.prompt.includes(readMarker)) {
      return [{ name: "flow_get", args: { flowId: FLOW } }];
    }
    if (ctx.roleId === "rapporteur" && ctx.prompt.includes("P1-7 标 delivered")) {
      return [
        {
          name: "flow_step_update",
          args: { flowId: FLOW, stepId: "impl", status: "delivered", expectedRevision: ownerRevision },
        },
      ];
    }
    if (ctx.roleId === "rapporteur" && ctx.prompt.includes("P1-7 owner 不得 done")) {
      return [
        {
          name: "flow_step_update",
          args: {
            flowId: FLOW,
            stepId: "impl",
            status: "done",
            expectedRevision: ownerRevision,
            evidence: { kind: "dispatch", ref: "impl" },
          },
        },
      ];
    }
    if (ctx.roleId === "convener" && ctx.prompt.includes("P1-7 manager 不得代标")) {
      // 步骤仍 dispatched：manager 代标 delivered 应拒（仅 owner），代标 done 也不合法（dispatched→done
      // 不属合法迁移）；两次拒绝都不写盘、revision 不变。
      return [
        {
          name: "flow_step_update",
          args: { flowId: FLOW, stepId: "impl", status: "delivered", expectedRevision: convenerRevision },
        },
        {
          name: "flow_step_update",
          args: {
            flowId: FLOW,
            stepId: "impl",
            status: "done",
            expectedRevision: convenerRevision,
            evidence: { kind: "dispatch", ref: "impl" },
          },
        },
      ];
    }
    if (ctx.roleId === "convener" && ctx.prompt.includes("P1-7 manager 核证 done")) {
      return [
        {
          name: "flow_step_update",
          args: {
            flowId: FLOW,
            stepId: "impl",
            status: "done",
            expectedRevision: convenerRevision,
            evidence: { kind: "dispatch", ref: "impl" },
          },
        },
      ];
    }
    return [];
  };

  const h = await makeHarness({
    tag: "dispatch-owner-delivered",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole,
  });
  try {
    const flowStatus = (): Record<string, string> => {
      const parsed = parseFlowStateYaml(read(temp.root, FLOW_REL), FLOW);
      assert.equal(parsed.ok, true, "flow YAML 应可解析");
      return Object.fromEntries(parsed.ok ? parsed.flow.steps.map((step) => [step.id, step.status]) : []);
    };
    const updatesFor = (roleId: string) =>
      h.results.filter((record) => record.roleId === roleId && record.name === "flow_step_update");
    const flowGetsFor = (roleId: string) =>
      h.results.filter((record) => record.roleId === roleId && record.name === "flow_get");
    /** 等第 expected 条 flow_get（roles 自己的），从回执消息取 revision（与真实角色「先读再改」同路径）。 */
    const readRevision = async (roleId: string, expected: number): Promise<string> => {
      await h.waitFor(() => flowGetsFor(roleId).length === expected, 5000);
      const message = flowGetsFor(roleId).at(-1)!.message;
      const revision = flowRevisionFrom(message);
      assert.ok(revision, `flow_get 应返回 revision：${message}`);
      return revision;
    };

    // ① Steward（manager）在 dispatched 态不得代标 delivered；dispatch→done 也不是合法迁移。
    await h.open("convener");
    await h.send("convener", `${readMarker}（代标前）`);
    convenerRevision = await readRevision("convener", 1);
    await h.send("convener", "P1-7 manager 不得代标：步骤仍 dispatched，尝试代标 delivered 与 done。");
    await h.waitFor(() => updatesFor("convener").length === 2, 5000);
    const [deniedDelivered, deniedDone] = updatesFor("convener");
    assert.equal(deniedDelivered!.ok, false, "manager 不得代标 delivered（P1-7）");
    assert.match(deniedDelivered!.message, /delivered 只能由步骤 impl 的 owner（rapporteur）标记/);
    assert.equal(deniedDone!.ok, false, "manager 不能在 dispatched 态直接标 done");
    assert.match(deniedDone!.message, /不允许从 dispatched 迁移到 done/);
    assert.equal(flowStatus()["impl"], "dispatched", "被拒的代标不改变状态");

    // ② owner（rapporteur，非管理者）读 revision → 标 delivered 通过。
    await h.open("rapporteur");
    await h.send("rapporteur", `${readMarker}（交付声明前）`);
    ownerRevision = await readRevision("rapporteur", 1);
    await h.send("rapporteur", "P1-7 标 delivered：impl 已完成交付，标自己步骤的 delivered。");
    await h.waitFor(() => updatesFor("rapporteur").length === 1, 5000);
    assert.equal(updatesFor("rapporteur")[0]!.ok, true, updatesFor("rapporteur")[0]!.message);
    assert.equal(flowStatus()["impl"], "delivered", "owner 标 delivered 落盘");

    // ③ 非管理者不能标 done（delivered → done 仅管理者）。
    await h.send("rapporteur", `${readMarker}（done 前）`);
    ownerRevision = await readRevision("rapporteur", 2);
    await h.send("rapporteur", "P1-7 owner 不得 done：尝试把 impl 标 done。");
    await h.waitFor(() => updatesFor("rapporteur").length === 2, 5000);
    assert.equal(updatesFor("rapporteur")[1]!.ok, false, "worker 不得标 done");
    assert.match(updatesFor("rapporteur")[1]!.message, /不允许从 delivered 迁移到 done/);
    assert.equal(flowStatus()["impl"], "delivered", "被拒的 done 不改变状态");

    // ④ Steward 在 owner delivered 后核证 done（delivered → done 仅管理者）。
    await h.send("convener", `${readMarker}（核证前）`);
    convenerRevision = await readRevision("convener", 2);
    await h.send("convener", "P1-7 manager 核证 done：owner 已 delivered，核证并标 done。");
    await h.waitFor(() => updatesFor("convener").length === 3, 5000);
    const allowedDone = updatesFor("convener")[2]!;
    assert.equal(allowedDone.ok, true, `owner delivered 后 manager 可核证 done：${allowedDone.message}`);
    assert.equal(flowStatus()["impl"], "done", "done 落盘");
    assert.equal(flowStatus()["work"], "pending", "后续步骤尚未被自动推进");
    assert.equal(flowStatus()["verification"], "pending", "验收步骤保持 pending");

    // ④ P0-2：done + 后续 pending（work 依赖 impl 已 done）⇒ Steward 收到一条 [自动推进]，含 ready。
    await h.waitFor(
      () => (h.prompts.get("convener") ?? []).some((prompt) => prompt.startsWith("[自动推进]") && prompt.includes("work")),
      8000,
    );
    const advanceTasks = (h.prompts.get("convener") ?? []).filter((prompt) => prompt.startsWith("[自动推进]"));
    assert.equal(advanceTasks.length, 1, `ready 唤醒恰一条 [自动推进]；实际=${JSON.stringify(advanceTasks)}`);
    const advance = advanceTasks[0]!;
    assert.match(advance, new RegExp(`^\\[自动推进\\] 流程 ${FLOW} 有可继续调度的就绪步骤`));
    assert.match(advance, /work｜owner=executor｜kind=dispatch｜parallelGroup=无｜dependsOn=impl/, "消息携带 ready 步骤与依赖");
    assert.doesNotMatch(advance, /verification｜/, "acceptance 步骤不得进入 ready 列表");
    const flowTextAfterWake = read(temp.root, FLOW_REL);

    // ⑤ 只提示、不自动派发：无 work 的 dispatch.accepted、无 verifier/Proof、不写账本、不弹客户卡。
    const ledger = await h.waitForLedger(() => true);
    assert.equal(
      ledger.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "work"),
      false,
      "ready 唤醒不得自动派发 work",
    );
    assert.equal(
      ledger.entries.filter((entry) => entry.kind === "dispatch.accepted").length,
      1,
      "账本只应有种子 impl 派发（唤醒不写 dispatch 账本）",
    );
    assert.equal(
      ledger.entries.filter((entry) => entry.kind === "customer.decision").length,
      2,
      "唤醒不写客户决定账本（仅种子 proposal-accept + appointment）",
    );
    assert.equal(h.openRoles.includes("verifier"), false, "不得派 Proof/verifier");
    assert.equal(h.prompts.get("verifier")?.length ?? 0, 0, "verifier 零消息");
    assert.equal(h.presented.length, 0, "全程 0 张客户卡");
    assert.equal(read(temp.root, FLOW_REL), flowTextAfterWake, "ready 唤醒不改写 flow YAML");
    assert.equal(flowStatus()["work"], "pending", "work 仍 pending（仅提示）");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
