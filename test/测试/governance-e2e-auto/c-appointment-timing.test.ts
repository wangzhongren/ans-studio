// test/测试/governance-e2e-auto/c-appointment-timing.test.ts
// 场景 3（离线端到端）：**任命后的时序**（2026-10-22 第 1/5 项，客户确认方案）。
//
// - 任命卡由 **Convener** 依团队计划发起；客户任命后应用派 **Crew 写卡**（不是 Convener）。
// - Crew 按第 5 项清单写出 role-card/boundary/工作文档；应用强制刷新 listing 并做扩展结构校验；
//   校验通过才派 Convener 做 `role-readiness`（恰一次）。
// - Crew 未写卡 ⇒ 不派 Convener、如实停住；客户拒绝/取消任命 ⇒ 不派 Crew。
//
// 旧用例（2026-10-18）由 Crew（Nominator）写提名并发 appointment 卡、写卡后直接派 Convener 排程——
// 与客户确认的治理分工第 1 项冲突，故按新方案更新；「写卡前绝不派 Convener」「恰一次」「拒绝不派」
// 等原强度保留并加强（新增团队计划绑定、role-readiness stepId、完整产物校验）。

import test from "node:test";
import assert from "node:assert/strict";

import { listProject } from "../../../src/service/role/resolve-role.ts";
import {
  FLOW,
  FLOW_REL,
  TEAM_PLAN_REL,
  exists,
  flowDoc,
  makeHarness,
  makeRoot,
  seedConfirmedIntent,
  seedLedger,
  seedTrioProject,
  teamPlanDoc,
  write,
  type ScriptContext,
} from "./fixture.ts";

const ROLE_ID = "executor";
const ROLE_CARD_REL = `角色卡/${ROLE_ID}/role-card.md`;
const ROLE_BOUNDARY_REL = `角色卡/${ROLE_ID}/boundary.yaml`;

/** 任命卡（Convener 发起；选项＝团队计划推荐集）。 */
const APPOINTMENT_CARD = {
  name: "request_choice",
  toolCallId: "tc-appointment-from-convener",
  args: {
    title: `任命 ${FLOW}`,
    question: "选择要任命的角色",
    flowId: FLOW,
    cardKind: "appointment",
    multiple: true,
    options: [{ id: ROLE_ID, label: "Executor" }],
  },
};

/** Crew 写卡：appointment-write 写盘确认 + 第 5 项完整产物。 */
function crewWriteScript(ctx: ScriptContext): Array<{ name: string; args: Record<string, unknown>; toolCallId?: string }> {
  if (!/appointment-write|写卡/.test(ctx.prompt)) return [];
  const files: Array<[string, string]> = [
    [
      ROLE_CARD_REL,
      [
        `# 角色：${ROLE_ID}`,
        "",
        "## 组别",
        "开发。",
        "",
        "## 工作立场",
        "对本角色交付长期负责。",
        "",
        "## 能力描述",
        "按团队计划实现并验证功能。",
        "",
        "## 系统功能导航",
        "见 feature-map.md。",
        "",
        "## 必读资料",
        "团队计划与提案。",
        "",
        "## 交接输入输出",
        "输入：团队计划；输出：实现与测试证据。",
        "",
        "## 执行原则",
        "只写计划内写集。",
        "",
        "## 质量职责",
        "交付可复现验证。",
        "",
        "## 标准工作流",
        "读计划 → 实现 → 测试 → 报告。",
        "",
        "## 交付物清单",
        "代码、测试与报告。",
        "",
      ].join("\n"),
    ],
    [
      ROLE_BOUNDARY_REL,
      [
        `role: ${ROLE_ID}`,
        "entries:",
        ...["feature-map.md", "functional-description.md", "memo.md", "api-spec.md"].flatMap((file) => [
          "  - kind: file",
          `    path: 角色卡/${ROLE_ID}/${file}`,
          "    purpose: 角色根工作文档",
        ]),
        "  - kind: directory",
        `    path: src/owned-${ROLE_ID}/`,
        "    purpose: 角色代码",
        "",
      ].join("\n"),
    ],
    ["角色卡/" + ROLE_ID + "/feature-map.md", "# 功能导航\n\n| 功能 | 入口 |\n| --- | --- |\n| 实现 | src/owned-executor/ |\n"],
    ["角色卡/" + ROLE_ID + "/functional-description.md", "# 功能说明\n\n职责：实现与测试。交接：向 Lead 报告。代码位置：src/owned-executor/。\n"],
    ["角色卡/" + ROLE_ID + "/memo.md", "# 备忘\n\n- 2026-10-22 由 Crew 按团队计划写卡。\n"],
    ["角色卡/" + ROLE_ID + "/api-spec.md", "# API\n\nnot-applicable：本角色无导出/共享接口。\n"],
  ];
  const pathList = files.map(([path]) => path);
  return [
    {
      name: "request_confirmation",
      toolCallId: "tc-appointment-write",
      args: {
        title: `写盘确认 ${FLOW}`,
        // 显式 paths（runtime 契约）：判断/写集按精确目标发行；preview 为每条路径给出可核对正文。
        paths: pathList,
        preview: [
          "将写入以下文件（逐路径正文）：",
          "",
          ...files.flatMap(([rel, content]) => [`## ${rel}`, "", content, ""]),
        ].join("\n"),
        flowId: FLOW,
        cardKind: "appointment-write",
      },
    },
    ...files.map(([path, content]) => ({ name: "write_file", args: { path, content } })),
  ];
}

async function seedPlanAndFlow(root: string): Promise<void> {
  seedTrioProject(root);
  write(root, FLOW_REL, flowDoc(FLOW, [{ id: "role-cards", status: "pending", kind: "dispatch" }]));
  write(root, TEAM_PLAN_REL, teamPlanDoc(FLOW, [ROLE_ID]));
  await seedLedger(root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
  ]);
  await seedConfirmedIntent(root);
}

test("场景3：客户任命后先派 Crew 写卡；结构校验通过才派 Convener 做 role-readiness 恰一次", async () => {
  const temp = makeRoot("appointment-timing");
  await seedPlanAndFlow(temp.root);

  const convenerSnapshots: Array<{ phase: "first" | "final"; filesExist: boolean; listed: boolean; roleIds: string[] }> = [];
  const snapshotConvener = async (phase: "first" | "final") => {
    const listing = await listProject(temp.root);
    const snapshot = {
      phase,
      filesExist: exists(temp.root, ROLE_CARD_REL) && exists(temp.root, ROLE_BOUNDARY_REL),
      listed: listing.roles.some((role) => role.roleId === ROLE_ID),
      roleIds: listing.roles.map((role) => role.roleId),
    };
    convenerSnapshots.push(snapshot);
    return snapshot;
  };
  const h = await makeHarness({
    tag: "appointment-timing",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => {
      if (ctx.roleId === "convener") {
        // 只对「请客户任命」这一步发 appointment 卡；readiness 任务不再发卡（由用例断言其文案）。
        return /直接发任命卡|请客户任命|任命卡/.test(ctx.prompt) && !/角色就绪复核|role-readiness/.test(ctx.prompt)
          ? [APPOINTMENT_CARD]
          : [];
      }
      if (ctx.roleId === "nominator") return crewWriteScript(ctx);
      return [];
    },
    onPrompt: async (ctx) => {
      if (ctx.roleId === "convener" && /角色就绪复核|role-readiness/.test(ctx.prompt)) {
        // 派 Convener 时角色卡/边界必须已落盘；等待 listing 枚举（Windows 目录枚举可能短暂滞后）。
        await snapshotConvener("first");
        const startedAt = Date.now();
        while (!(await snapshotConvener("final")).listed && Date.now() - startedAt <= 2000) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
    },
  });
  try {
    await h.open("convener");
    const sent = await h.send("convener", "请依团队计划请客户任命 executor。");
    assert.equal(sent.ok, true, sent.error ?? "");

    // 等 Crew 写卡后应用派 Convener readiness。
    try {
      await h.waitFor(
        () => (h.prompts.get("convener") ?? []).some((prompt) => /角色就绪复核|role-readiness/.test(prompt)),
        10000,
      );
    } catch (error) {
      throw new Error(
        `${(error as Error).message}；convener=${JSON.stringify(h.prompts.get("convener"))}; ` +
          `nominator=${JSON.stringify(h.prompts.get("nominator"))}; ` +
          `recentResults=${JSON.stringify(h.results.slice(-10))}`,
      );
    }

    // ① 任命由 Convener 发起，绑定团队计划；任命后应用派 Crew 写卡（不是 Convener）。
    const ledger = await h.waitForLedger(
      (entries) =>
        entries.some((entry) => entry.decisionKind === "appointment") &&
        entries.some((entry) => entry.decisionKind === "appointment-write") &&
        entries.some((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener" && entry.stepId === "role-readiness"),
      10000,
    );
    const appointment = ledger.entries.find((entry) => entry.decisionKind === "appointment");
    assert.ok(appointment, "应有 appointment 决定");
    assert.equal(appointment!.actorRoleId, "convener");
    assert.equal(appointment!.power, "schedule");
    assert.deepEqual(appointment!.targetRoleIds, [ROLE_ID]);
    assert.equal(appointment!.artifactPath, TEAM_PLAN_REL);
    assert.equal(appointment!.decisionEvidence?.kind, "judge");

    const crewDispatch = ledger.entries.find(
      (entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "nominator",
    );
    assert.ok(crewDispatch, "任命后应用应派 Crew 写卡");
    assert.equal(crewDispatch!.stepId, "role-cards");
    assert.equal(crewDispatch!.actorRoleId, "app");
    assert.equal(crewDispatch!.power, "app");

    const appointmentWrite = ledger.entries.find((entry) => entry.decisionKind === "appointment-write");
    assert.ok(appointmentWrite, "应有 appointment-write 写盘确认");
    assert.equal(appointmentWrite!.decisionEvidence?.kind, "judge");
    assert.deepEqual(
      (appointmentWrite!.paths ?? []).slice().sort(),
      [
        ROLE_CARD_REL,
        ROLE_BOUNDARY_REL,
        `角色卡/${ROLE_ID}/feature-map.md`,
        `角色卡/${ROLE_ID}/functional-description.md`,
        `角色卡/${ROLE_ID}/memo.md`,
        `角色卡/${ROLE_ID}/api-spec.md`,
      ].sort(),
    );

    // ② Crew 先收到写卡任务；Convener 第一条是任命任务，第二条才是 readiness（写卡后）。
    const convenerPrompts = h.prompts.get("convener") ?? [];
    assert.equal(convenerPrompts.length, 2, `Convener 先任命、后 readiness 各一条；实际=${JSON.stringify(convenerPrompts)}`);
    assert.match(convenerPrompts[1]!, /角色就绪复核/);
    assert.match(convenerPrompts[1]!, /role-readiness/);
    assert.match(convenerPrompts[1]!, /能力内容尚未判定/);
    const nominatorPrompts = h.prompts.get("nominator") ?? [];
    assert.equal(nominatorPrompts.length, 1, "Crew 恰收到一条写卡任务");
    assert.match(nominatorPrompts[0]!, /团队计划 docs\/scheduling\/flow-a-team-v1\.md/);
    assert.match(nominatorPrompts[0]!, /appointment-write/);

    // ③ 派 Convener 时写卡产物已存在且可枚举（写卡前绝不派 Convener）。
    const first = convenerSnapshots.find((snapshot) => snapshot.phase === "first");
    assert.ok(first, "缺少派 readiness 时的首次快照");
    assert.equal(first!.filesExist, true, "派 Convener readiness 时角色卡/边界必须已落盘");
    assert.equal(first!.listed, true, "派 Convener readiness 时角色必须已枚举");

    // ④ readiness 派发账本恰一条（app 动作），appointment 步骤未被伪标 done。
    const readinessDispatches = ledger.entries.filter(
      (entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener" && entry.stepId === "role-readiness",
    );
    assert.equal(readinessDispatches.length, 1, "role-readiness 派发恰一次");
    assert.equal(h.presented.length, 0, "双开关开 + 判断 allow ⇒ 0 张手动卡");

    // ⑤ listing 刷新：界面枚举可见 executor；治理角色 settle 触发 project:changed。
    const listing = await h.iface.listProject({ projectRoot: temp.root });
    assert.equal(listing.roles.some((role) => role.roleId === ROLE_ID), true, "左树 listing 刷新后 executor 可枚举");
    assert.ok(h.projectChanged > 0, "治理角色 settle 后 emitProjectChanged");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("场景3b：Crew 始终未写卡 ⇒ 不派 Convener readiness、如实停住、不循环", async () => {
  const temp = makeRoot("appointment-timing-missing");
  await seedPlanAndFlow(temp.root);
  const h = await makeHarness({
    tag: "appointment-timing-missing",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole: (ctx) => {
      if (ctx.roleId === "convener" && /直接发任命卡|请客户任命|任命卡/.test(ctx.prompt)) return [APPOINTMENT_CARD];
      if (ctx.roleId === "nominator") return []; // 模拟写卡失败/未写
      return [];
    },
  });
  try {
    await h.open("convener");
    await h.send("convener", "请依团队计划请客户任命 executor。");
    const ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "nominator"),
      8000,
    );
    assert.ok(
      ledger.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "nominator"),
      "写卡任务已投递",
    );
    // 留出写卡后检查的有界重试窗口；全量并发负载下反馈可能晚到，等到第 2 条 Crew 任务再断言。
    await h.waitFor(() => (h.prompts.get("nominator")?.length ?? 0) >= 2, 15000);
    assert.equal(
      (h.prompts.get("convener") ?? []).filter((prompt) => /角色就绪复核|role-readiness/.test(prompt)).length,
      0,
      "角色未写出时绝不派 Convener readiness",
    );
    assert.equal(
      ledger.entries.some(
        (entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener" && entry.stepId === "role-readiness",
      ),
      false,
      "不得写 role-readiness 派发账本",
    );
    // Crew 未写卡：有界重试耗尽后应用把**具体缺件**反馈 Crew 修正一次（不是无限循环），
    // 但绝不派 Convener；这是 2026-10-20 确定性门控的既有语义，未放宽。
    const nominatorPrompts = h.prompts.get("nominator") ?? [];
    assert.equal(nominatorPrompts.length, 2, `写卡任务 + 一次有界修正反馈；实际=${JSON.stringify(nominatorPrompts)}`);
    assert.match(nominatorPrompts[1]!, /写卡产物未通过校验/);
    assert.match(nominatorPrompts[1]!, /角色卡\/executor\/role-card\.md：文件不存在/);
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(h.prompts.get("nominator")?.length, 2, "同问题不得重复反馈（不循环）");
    assert.equal(
      (h.prompts.get("convener") ?? []).filter((prompt) => /角色就绪复核|role-readiness/.test(prompt)).length,
      0,
      "无界重试/反馈后仍绝不派 Convener readiness",
    );
    assert.equal(exists(temp.root, ROLE_CARD_REL), false);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("场景3c：客户拒绝/取消任命 ⇒ 不派 Crew 写卡、无 appointment 决定", async () => {
  const temp = makeRoot("appointment-rejected");
  await seedPlanAndFlow(temp.root);
  const h = await makeHarness({
    tag: "appointment-rejected",
    root: temp.root,
    // decision 关：appointment 卡直接呈现客户（不判断），由用例作答「取消」。
    approval: true,
    decision: false,
    scriptForRole: (ctx) => {
      if (ctx.roleId === "convener" && /直接发任命卡|请客户任命|任命卡/.test(ctx.prompt)) return [APPOINTMENT_CARD];
      return [];
    },
  });
  try {
    await h.open("convener");
    // decision 关：appointment 卡要等客户作答才结算——不能阻塞等待 send 完成后再作答。
    const sending = h.send("convener", "请依团队计划请客户任命 executor。");
    await h.waitFor(() => h.presented.some((payload) => payload.request.cardKind === "appointment"), 5000);
    const card = h.presented.find((payload) => payload.request.cardKind === "appointment")!;
    h.answer(card.id, { kind: "choice", selected: [], cancelled: true });
    const sent = await sending;
    assert.equal(sent.ok, true, sent.error ?? "");

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(h.prompts.get("nominator")?.length ?? 0, 0, "取消任命不得派 Crew 写卡");
    assert.equal(h.openRoles.includes("nominator"), false, "不得为 Crew 开会话");
    const ledger = await h.waitForLedger(() => true);
    assert.equal(
      ledger.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "nominator"),
      false,
      "取消任命不得写 Crew 派发账本",
    );
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
