// test/测试/governance-e2e-auto/i-full-chain.test.ts
// **canonical 正链**（离线端到端，2026-10-22 治理分工第 1/3/5 项，客户确认方案）：
// Lead 交接意图 → Draft 提案并请客户接受 → Convener 写流程 YAML + 团队计划并**直接发任命卡** →
// 客户任命 → 应用派 Crew 写卡（角色卡/边界/工作文档，结构校验通过）→ Convener role-readiness →
// 实施派发（O2：先有实施前标准）→ Convener 写变更包 → Verifier 报告 + acceptance 卡 → 客户验收。
//
// 唯一非产品件是模型会话（脚本桩）与判断会话（假模型交回 approve）；其余走真实桌面 Interface、
// 真实 run-role/gate/issuer/账本/客户通道/判断 driver/listing 刷新。旧的「Crew 提名 → Crew 发任命卡 →
// 写卡后直接派 Convener 排程」链路与客户确认的第 1 项冲突，已按新方案更新（不删除负例，负例见
// b/c/d/f 各文件与 team-plan-guard）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { ToolCall } from "../../../src/model/runtime.ts";
import {
  CHANGE_PACKAGE_REL,
  CRITERIA_REL,
  FLOW,
  FLOW_REL,
  NOMINATION_REL,
  PROPOSAL_REL,
  READINESS_REL,
  REPORT_REL,
  TEAM_PLAN_REL,
  acceptanceCriteriaDoc,
  acceptanceReportDoc,
  changePackageDoc,
  exists,
  flowDoc,
  intentDoc,
  intentHandoffArgs,
  makeHarness,
  makeRoot,
  proposalDoc,
  roleBoundaryDoc,
  roleCardDoc,
  roleWorkDocs,
  seedTrioProject,
  teamPlanDoc,
  type ScriptContext,
} from "./fixture.ts";

const ROLE_CARD_REL = "角色卡/executor/role-card.md";
const ROLE_BOUNDARY_REL = "角色卡/executor/boundary.yaml";
const INTENT_REL = "docs/intents/intent-a.md";

/**
 * 最终流程 YAML（所有执行步骤 done、验收步骤 pending）：证据与账本对账。
 * 团队计划/标准/变更包是 artifact；appointment 是 customer-decision；role-cards/readiness/impl 是 dispatch。
 */
function finalFlowDoc(): string {
  return flowDoc(FLOW, [
    { id: "team-plan", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: TEAM_PLAN_REL } },
    { id: "appointment", kind: "customer-decision", status: "done", evidence: { kind: "customer-decision", ref: "appointment" } },
    { id: "role-cards", kind: "dispatch", status: "done" },
    { id: "role-readiness", kind: "dispatch", status: "done" },
    { id: "acceptance-criteria", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: CRITERIA_REL } },
    { id: "change-package", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: CHANGE_PACKAGE_REL } },
    { id: "impl", kind: "dispatch", status: "done" },
    { id: "verification", kind: "acceptance", status: "pending" },
  ]);
}

test("五角色全自动链路：意图→提案→团队计划→任命→Crew 写卡→readiness→实施→标准/变更包→Verifier→acceptance", async () => {
  const temp = makeRoot("full-chain");
  seedTrioProject(temp.root);
  let readinessDone = false;
  let reportDone = false;

  const scriptForRole = (ctx: ScriptContext): ToolCall[] => {
    if (
      ctx.roleId === "liaison" &&
      !ctx.prompt.includes("[系统·治理反馈]") &&
      !/已交给报告员|客户意图已交接/.test(ctx.prompt)
    ) {
      return [
        { name: "write_file", args: { path: INTENT_REL, content: intentDoc("intent-a") } },
        {
          name: "request_choice",
          args: {
            title: "需求确认 intent-a",
            question: "请确认目标、范围与验收标准。",
            flowId: FLOW,
            cardKind: "intent-confirm",
            options: [
              { id: "confirm", label: "确认" },
              { id: "revise", label: "修改" },
            ],
          },
        },
        { name: "hand_off_intent", args: intentHandoffArgs("intent-a") },
      ];
    }
    if (ctx.roleId === "rapporteur" && /客户意图已交接|请形成提案/.test(ctx.prompt)) {
      return [
        { name: "write_file", args: { path: PROPOSAL_REL, content: proposalDoc(FLOW, 1, "intent-a") } },
        {
          name: "request_choice",
          args: {
            title: `提案 ${FLOW}`,
            question: "是否接受该提案？",
            flowId: FLOW,
            cardKind: "proposal",
            options: [
              { id: "accept", label: "接受" },
              { id: "accept-quick", label: "快捷接受" },
              { id: "revise", label: "要求修改" },
              { id: "reject", label: "拒绝" },
            ],
          },
        },
      ];
    }
    if (ctx.roleId === "convener") {
      if (/客户已接受提案/.test(ctx.prompt)) {
        // 2026-10-22 第 1 项：写流程 YAML + 团队计划，同一轮直接发 appointment 卡。
        return [
          {
            name: "write_file",
            args: {
              path: FLOW_REL,
              content: flowDoc(FLOW, [
                { id: "team-plan", kind: "artifact", status: "pending" },
                { id: "appointment", kind: "customer-decision", status: "pending" },
                { id: "role-cards", kind: "dispatch", status: "pending" },
                { id: "role-readiness", kind: "dispatch", status: "pending" },
                { id: "acceptance-criteria", kind: "artifact", status: "pending" },
                { id: "change-package", kind: "artifact", status: "pending" },
                { id: "impl", kind: "dispatch", status: "pending" },
                { id: "verification", kind: "acceptance", status: "pending" },
              ]),
            },
          },
          { name: "write_file", args: { path: TEAM_PLAN_REL, content: teamPlanDoc(FLOW, ["executor"]) } },
          {
            name: "request_choice",
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
      if (/角色就绪复核|role-readiness/.test(ctx.prompt)) {
        // 标准尚未落盘时先不做（由用例在标准/物证就绪后再次驱动）；避免与自动派发竞争。
        if (!exists(temp.root, CRITERIA_REL) || readinessDone) return [];
        readinessDone = true;
        return [
          {
            name: "write_file",
            args: {
              path: READINESS_REL,
              content: `---\nflowId: ${FLOW}\nversion: 1\nstatus: pass\n---\n\n# 角色就绪复核 ${FLOW}\n\n| roleId | 职责目标 | 能力要求 | 写集/边界 | 依赖/交接 | 质量责任 | 结论 | 证据 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| executor | pass | pass | pass | pass | pass | pass | 角色卡/executor/role-card.md |\n`,
            },
          },
          { name: "write_file", args: { path: CHANGE_PACKAGE_REL, content: changePackageDoc(FLOW, "T1") } },
          // 实施派发（O2：标准已在盘上）。dispatch 成功后账本有 stepId=impl 的 dispatch.accepted。
          {
            name: "dispatch_task",
            args: { roleId: "executor", task: "执行 impl 步骤", flowId: FLOW, stepId: "impl" },
          },
        ];
      }
      if (/收尾流程/.test(ctx.prompt)) {
        return [{ name: "write_file", args: { path: FLOW_REL, content: finalFlowDoc() } }];
      }
      return [];
    }
    if (ctx.roleId === "nominator") {
      if (/appointment-write/.test(ctx.prompt)) {
        const files: Array<[string, string]> = [
          [ROLE_CARD_REL, roleCardDoc("executor")],
          [ROLE_BOUNDARY_REL, roleBoundaryDoc("executor")],
          ...Object.entries(roleWorkDocs()).map(
            ([file, content]) => [`角色卡/executor/${file}`, content] as [string, string],
          ),
        ];
        const paths = files.map(([rel]) => rel);
        return [
          {
            name: "request_confirmation",
            args: {
              title: `写盘确认 ${FLOW}`,
              paths,
              // 逐路径可核对正文（内容与下一轮 write_file 实际写入一致）。
              preview: [
                "将写入以下文件（逐路径正文）：",
                "",
                ...files.map(([rel, content]) => `## ${rel}\n\n${content}`),
              ].join("\n"),
              flowId: FLOW,
              cardKind: "appointment-write",
            },
          },
          ...files.map(([path, content]) => ({ name: "write_file", args: { path, content } })),
        ];
      }
      return [];
    }
    if (ctx.roleId === "verifier") {
      if (/实施前完成标准|acceptance-criteria/.test(ctx.prompt)) {
        return [
          {
            name: "write_file",
            args: { path: CRITERIA_REL, content: acceptanceCriteriaDoc(FLOW) },
          },
        ];
      }
      if (/出验收卡|验收报告/.test(ctx.prompt)) {
        if (reportDone) return [];
        reportDone = true;
        return [
          { name: "write_file", args: { path: REPORT_REL, content: acceptanceReportDoc(FLOW, "T1") } },
          {
            name: "request_choice",
            args: {
              title: `验收 ${FLOW}`,
              question: "是否验收通过？",
              flowId: FLOW,
              cardKind: "acceptance",
              options: [
                { id: "accept", label: "通过" },
                { id: "reject", label: "不通过" },
              ],
            },
          },
        ];
      }
      return [];
    }
    if (ctx.roleId === "executor") {
      return [
        { name: "submit_report", args: { status: "completed", summary: "impl 步骤已完成（离线夹具）。" } },
      ];
    }
    return [];
  };

  const h = await makeHarness({
    tag: "full-chain",
    root: temp.root,
    approval: true,
    decision: true,
    scriptForRole,
    // 标准/报告是 Verifier 的预授权写区（docs/acceptance）；写后属性由 flow-service 观察。
    governanceChain: { pollIntervalMs: 10, timeoutMs: 5000, settledGraceMs: 10 },
  });
  try {
    await h.open("liaison");
    const sent = await h.send("liaison", "请把客户意图交给报告员。");
    assert.equal(sent.ok, true, sent.error ?? "");
    assert.equal(h.presented.length, 0, "intent-confirm 由判断代批，0 张客户卡");
    const intentRow = h.judgeRows.find((row) => row.cardKind === "intent-confirm");
    assert.ok(intentRow, "应有 intent-confirm 判断结果行");
    assert.equal(intentRow!.group, "decision");
    assert.deepEqual(intentRow!.selected, ["confirm"]);

    // —— 阶段 1：任命 + Crew 写卡（标准由用例显式驱动 Verifier：离线夹具无真实凭据，
    //    产品的自动验收/标准派发在「无法解析运行时」时按设计不派；这里用真实 Verifier 会话补位） ——
    try {
      await h.waitFor(
        () => exists(temp.root, ROLE_CARD_REL) && exists(temp.root, TEAM_PLAN_REL),
        15000,
      );
    } catch (error) {
      throw new Error(
        `${(error as Error).message}；files=${JSON.stringify({
          roleCard: exists(temp.root, ROLE_CARD_REL),
          teamPlan: exists(temp.root, TEAM_PLAN_REL),
        })}; openRoles=${JSON.stringify(h.openRoles)}; results=${JSON.stringify(h.results.slice(-12))}`,
      );
    }
    const phase1 = await h.waitForLedger(
      (entries) =>
        entries.some((entry) => entry.decisionKind === "appointment") &&
        entries.some((entry) => entry.decisionKind === "appointment-write"),
      15000,
    );
    const appointment = phase1.entries.find((entry) => entry.decisionKind === "appointment");
    assert.ok(appointment, "应有 appointment 决定");
    assert.equal(appointment!.actorRoleId, "convener", "任命卡由 Convener 发起");
    assert.equal(appointment!.power, "schedule");
    assert.deepEqual(appointment!.targetRoleIds, ["executor"]);
    assert.equal(appointment!.artifactPath, TEAM_PLAN_REL, "appointment 绑定团队计划");
    assert.equal(appointment!.decisionEvidence?.kind, "judge");
    const appointmentWrite = phase1.entries.find((entry) => entry.decisionKind === "appointment-write");
    assert.ok(appointmentWrite, "Crew 写卡应有 appointment-write 决定");
    assert.equal(appointmentWrite!.decisionEvidence?.kind, "judge");
    assert.equal(exists(temp.root, NOMINATION_REL), false, "新流程不再产生 docs/nominations/ 提名文件");

    // 阶段 1b：Verifier 写实施前标准（O2 前置；真实会话 + 真实预授权写区 + artifact.observed）。
    const verifierOpened = await h.iface.openSession({ projectRoot: temp.root, roleId: "verifier", runtime: "claude" });
    assert.equal(verifierOpened.ok, true, verifierOpened.error ?? "");
    const criteriaTask = await h.send("verifier", "请写实施前完成标准（acceptance-criteria）。");
    assert.equal(criteriaTask.ok, true, criteriaTask.error ?? "");
    await h.waitFor(() => exists(temp.root, CRITERIA_REL), 8000);
    await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === CRITERIA_REL),
      8000,
    );

    // —— 阶段 2：readiness → 实施派发（O2 标准已落盘） ——
    // 自动派发可能在标准落盘前触发且脚本跳过；标准就绪后手动补一次同样任务（幂等 guarded）。
    const convenerForReadiness = await h.iface.openSession({ projectRoot: temp.root, roleId: "convener", runtime: "claude" });
    assert.equal(convenerForReadiness.ok, true, convenerForReadiness.error ?? "");
    const readinessTask = await h.send("convener", "请继续角色就绪复核（role-readiness）。");
    assert.equal(readinessTask.ok, true, readinessTask.error ?? "");
    const phase2 = await h.waitForLedger(
      (entries) =>
        entries.some(
          (entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener" && entry.stepId === "role-readiness",
        ) &&
        entries.some(
          (entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "convener" && entry.stepId === "impl",
        ),
      15000,
    );
    // artifact.observed 在角色 settle 时追加（晚于 dispatch 账本）；并发负载下等到它们落账再断言。
    const observed = await h.waitForLedger(
      (entries) =>
        entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === READINESS_REL) &&
        entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === CHANGE_PACKAGE_REL),
      15000,
    );
    assert.ok(
      observed.entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === READINESS_REL),
      "readiness 记录应作为 artifact 被观察",
    );
    assert.ok(
      observed.entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === CHANGE_PACKAGE_REL),
      "变更包应由 Convener 写出并被观察",
    );
    await h.waitFor(() => (h.prompts.get("executor")?.length ?? 0) > 0, 5000);
    assert.match(h.prompts.get("executor")!.at(-1)!, /执行 impl 步骤/);

    // —— 阶段 3：Convener 收尾流程 YAML（按账本证据标 done；验收步骤保持 pending） ——
    const convenerForFinalize = await h.iface.openSession({ projectRoot: temp.root, roleId: "convener", runtime: "claude" });
    assert.equal(convenerForFinalize.ok, true, convenerForFinalize.error ?? "");
    const finalizeTask = await h.send("convener", "请收尾流程：按账本证据把执行步骤标 done。");
    assert.equal(finalizeTask.ok, true, finalizeTask.error ?? "");
    await h.waitFor(() => /^\s+status: done$/m.test(readFileSync(`${temp.root}/${FLOW_REL}`, "utf8")) && /id: impl/.test(readFileSync(`${temp.root}/${FLOW_REL}`, "utf8")), 8000);

    // —— 阶段 4：Verifier 写报告 + acceptance 卡；判断代批（验收机械门槛读流程/账本/标准/报告/变更包） ——
    // 等变更包与最终流程 YAML 的 artifact.observed 落账（验收机械门槛对账所需）。
    await h.waitForLedger(
      (entries) =>
        entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === CHANGE_PACKAGE_REL) &&
        entries.filter((entry) => entry.kind === "artifact.observed" && entry.artifactPath === FLOW_REL).length >= 2,
      8000,
    );
    // LRU 可能已回收 Verifier 的空闲会话：重新打开后再投递验收任务（目标角色会话，不改变当前 pane）。
    const verifierReopen = await h.iface.openSession({ projectRoot: temp.root, roleId: "verifier", runtime: "claude" });
    assert.equal(verifierReopen.ok, true, verifierReopen.error ?? "");
    const acceptanceTask = await h.send("verifier", "请汇总证据并出验收卡（附验收报告）。");
    assert.equal(acceptanceTask.ok, true, acceptanceTask.error ?? "");
    const final = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.decisionKind === "acceptance"),
      20000,
    );
    const acceptance = final.entries.find((entry) => entry.decisionKind === "acceptance");
    if (acceptance === undefined) {
      throw new Error(
        `应有 acceptance 客户决定（判断代批）；judgeRows=${JSON.stringify(h.judgeRows)}; ` +
          `verifierPrompts=${JSON.stringify(h.prompts.get("verifier"))}; ` +
          `decisions=${JSON.stringify(final.entries.filter((entry) => entry.kind === "customer.decision").map((entry) => [entry.decisionKind, entry.customerDecision]))}; ` +
          `recentResults=${JSON.stringify(h.results.filter((result) => result.roleId === "verifier"))}; ` +
          `flow=${readFileSync(`${temp.root}/${FLOW_REL}`, "utf8")}`,
      );
    }
    assert.equal(acceptance!.customerDecision, "accepted");
    assert.equal(acceptance!.decisionEvidence?.kind, "judge");
    assert.ok(exists(temp.root, REPORT_REL), "验收报告应落盘");

    // —— 汇总断言：链路顺序、账本可还原、0 张手卡 ——
    const first = (roleId: string): number => h.openRoles.indexOf(roleId);
    assert.ok(first("liaison") >= 0, "Liaison 由客户打开");
    assert.ok(first("rapporteur") > first("liaison"), "交接后后台开 Rapporteur");
    assert.ok(first("convener") > first("rapporteur"), "接受提案后开 Convener");
    assert.ok(first("nominator") > first("convener"), "任命决定后开 Crew（不是 Convener）");
    assert.ok(first("verifier") > first("nominator"), "标准/验收任务开 Verifier");
    assert.ok(first("executor") > first("nominator"), "实施派发后开 executor");

    const ledger = await h.waitForLedger(() => true);
    assert.deepEqual(ledger.errors, [], "账本无坏行");
    assert.ok(ledger.entries.some((entry) => entry.kind === "intent.handed-off" && entry.intentId === "intent-a"));
    const decisions = ledger.entries.filter((entry) => entry.kind === "customer.decision");
    for (const kind of ["proposal-accept", "appointment", "appointment-write", "acceptance"]) {
      const decision = decisions.find((entry) => entry.decisionKind === kind);
      assert.ok(decision, `应有 ${kind} 决定`);
      assert.equal(decision!.decisionEvidence?.kind, "judge", `${kind} 应由判断代批并留 judge 证据`);
    }
    const intentConfirm = decisions.find((entry) => entry.decisionKind === "intent-confirm");
    assert.ok(intentConfirm, "应有 intent-confirm 决定");
    assert.equal(intentConfirm!.decisionEvidence?.kind, "judge");
    const appDispatches = ledger.entries.filter(
      (entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "app",
    );
    const appTargets = appDispatches
      .filter((entry) => entry.trigger === "customer-decision")
      .map((entry) => `${entry.targetRoleId}:${entry.stepId ?? ""}`);
    for (const expected of ["convener:", "nominator:role-cards", "convener:role-readiness"]) {
      assert.ok(appTargets.includes(expected), `应用派发应包含 ${expected}；实际=${JSON.stringify(appTargets)}`);
    }
    // 标准/报告由真实 Verifier 会话在离线夹具中显式驱动（无真实凭据时产品自动派发按设计不派），
    // 但仍须有 artifact.observed 与 acceptance 客户决定，且判断门槛真实核对。
    assert.ok(
      ledger.entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === CRITERIA_REL),
      "标准应作为 artifact 被观察",
    );
    assert.ok(
      ledger.entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === REPORT_REL),
      "验收报告应作为 artifact 被观察",
    );
    const convenerDispatch = ledger.entries.find(
      (entry) => entry.kind === "dispatch.accepted" && entry.actorRoleId === "convener",
    );
    assert.ok(convenerDispatch, "Convener 的 dispatch_task 应受理入账");
    assert.equal(convenerDispatch!.targetRoleId, "executor");
    assert.equal(convenerDispatch!.stepId, "impl");
    assert.equal(convenerDispatch!.power, "schedule");

    // 产物：提案/流程/团队计划/标准/报告/变更包/角色卡/边界全部落盘。
    for (const rel of [
      PROPOSAL_REL,
      FLOW_REL,
      TEAM_PLAN_REL,
      CRITERIA_REL,
      REPORT_REL,
      CHANGE_PACKAGE_REL,
      READINESS_REL,
      ROLE_CARD_REL,
      ROLE_BOUNDARY_REL,
    ]) {
      assert.equal(exists(temp.root, rel), true, `应落盘：${rel}`);
    }
    assert.equal(exists(temp.root, NOMINATION_REL), false, "不得回退写 nominations");

    const listing = await h.iface.listProject({ projectRoot: temp.root });
    assert.equal(listing.roles.some((role) => role.roleId === "executor"), true);
    assert.ok(h.projectChanged > 0, "listing 刷新触发 project:changed");
    assert.equal(h.presented.length, 0, "decision 开：全部治理卡由判断代批，0 张手动卡");
    assert.deepEqual(h.userOpened, ["liaison"], "全程只有 Liaison 由客户打开（后台派发不抢活动角色）");
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});
