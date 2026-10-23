// test/测试/governance-liaison-verify/e-audit.test.ts
// 独立端到端验收（测试角色，2026-10-18）：审计还原——从 `.ans/governance/ledger.jsonl`
// 还原「谁沟通 / 谁提案 / 谁提名 / 谁排程 / 客户批了什么 / 应用派发给谁」。
//
// 依据：四角色评审 §7.3、§十 AC17。全部离线（临时目录 + 自建适配器 + 注入式 SessionManager），
// 不读 `.env`、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";
import { readGovernanceLedger, type GovernanceLedgerEntry } from "../../../src/common/编排/governance-ledger.ts";
import type { CustomerInputFn } from "../../../src/model/runtime.ts";
import {
  capture,
  customerChannel,
  exists,
  flowDoc,
  handoffPayload,
  intentDoc,
  makeRoot,
  proposalDoc,
  seedIntentConfirm,
  toolAdapterFactory,
  waitForLedger,
  write,
  writeProjectRole,
  type Captured,
} from "./fixture.ts";

const FLOW = "flow-a";
const STEP = "impl";
const INTENT = "intent-a";
const TEAM_PLAN_REL = `docs/scheduling/${FLOW}-team-v1.md`;
const CRITERIA_REL = `docs/acceptance/${FLOW}-criteria-v1.md`;

/** 团队计划（2026-10-22 第 1 项）：Convener 唯一作者；卡前守卫要求的确定性形状。 */
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

/** 实施前验收标准（O2 派发门槛）。 */
const CRITERIA_DOC = [
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
  "证据计划：测试输出与候选哈希。",
  "",
  "版本与冻结：写盘后冻结。",
  "",
].join("\n");

/** 独立还原器：只读账本事实，还原审计问题（不依靠 Markdown status）。 */
function reconstruct(entries: readonly GovernanceLedgerEntry[]) {
  const handoff = entries.find((e) => e.kind === "intent.handed-off");
  const proposer = entries.find(
    (e) => e.kind === "artifact.observed" && (e.artifactPath ?? "").startsWith("docs/proposals/"),
  );
  // 2026-10-22 第 1 项：团队判断/团队计划归 Convener（原「提名 = Nominator」改为「组队/团队计划」）。
  const teamPlanner = entries.find(
    (e) => e.kind === "artifact.observed" && /^docs\/scheduling\/.+-team-v\d+\.md$/.test(e.artifactPath ?? ""),
  );
  const scheduler = entries.find(
    (e) => e.kind === "artifact.observed" && (e.artifactPath ?? "").startsWith("docs/flows/"),
  );
  const decisions = entries.filter((e) => e.kind === "customer.decision");
  const toolDispatch = entries.find((e) => e.kind === "dispatch.accepted" && e.actorRoleId === "convener");
  const appDispatch = entries.find((e) => e.kind === "dispatch.accepted" && e.actorRoleId === "app");
  return {
    communicatedBy: handoff?.actorRoleId,
    intent: handoff
      ? {
          intentId: handoff.intentId,
          handoffKind: handoff.handoffKind,
          artifactPath: handoff.artifactPath,
          sha: handoff.artifactSha256,
        }
      : undefined,
    proposedBy: proposer?.actorRoleId,
    proposalPath: proposer?.artifactPath,
    teamPlannedBy: teamPlanner?.actorRoleId,
    teamPlanPath: teamPlanner?.artifactPath,
    scheduledBy: scheduler?.actorRoleId,
    flowPath: scheduler?.artifactPath,
    customerApprovals: decisions.map((d) => ({
      kind: d.decisionKind,
      decision: d.customerDecision,
      targets: d.targetRoleIds,
      paths: d.paths,
    })),
    dispatchedByConvener: toolDispatch?.targetRoleId,
    dispatchedByApp: appDispatch ? { target: appDispatch.targetRoleId, trigger: appDispatch.trigger } : undefined,
  };
}

test("审计还原：意图→提案→组队（团队计划）→任命→派程→验收，账本可还原谁沟通/谁提案/谁组队/谁排程/客户批了什么", async () => {
  const { root, cleanup } = makeRoot("audit-chain");
  try {
    writeProjectRole(root, "A");
    write(root, ".ans/project.json", JSON.stringify({ projectRoot: root, roles: {}, governanceModel: "trio" }) + "\n");
    write(
      root,
      `docs/intents/${INTENT}.md`,
      intentDoc({
        intentId: INTENT,
        handoffKind: "initial",
        goal: "离线验收提案",
        scope: "只读分析",
        acceptance: "客户接受提案",
        flowId: FLOW,
      }),
    );
    write(root, "角色卡/A/role-card.md", "# 角色：A\n\n由 Nominator 写出。\n");
    // 2026-10-18 客户拍板：initial 交接前须有客户对需求（intent-confirm）的确认决定。
    await seedIntentConfirm(root, { flowId: FLOW });
    // 提案/提名/流程单故意**不预写**：由对应会话真实写出，settle 后才有 artifact.observed
    // （会话 open 时已存在的同内容文件会进基线，重写相同字节不会产生新观察）。

    const listing: ProjectListing = await listProject(root);
    assert.equal(listing.governanceModel, "trio");

    const customerInput: CustomerInputFn = (req) => {
      if (req.kind === "choice") {
        const selected =
          req.cardKind === "appointment" ? ["A"] : req.cardKind === "acceptance" ? ["accept"] : ["accept"];
        return { outcome: "answered", value: { selected }, operatorId: "test:客户" };
      }
      return { outcome: "answered", value: { confirmed: true }, operatorId: "test:客户" };
    };
    const buildConfig = (
      l: ProjectListing,
      acceptance: Parameters<typeof buildProjectConfig>[1],
      env?: Record<string, string | undefined>,
      govPath?: string,
    ) => {
      const config = buildProjectConfig(l, acceptance, env, govPath);
      return {
        ...config,
        governanceBoundary: {
          path: "角色卡/governance-boundary.yaml",
          acceptance: { accepted: true, source: "test:audit" },
        },
      };
    };
    const scripts: Record<string, Array<{ name: string; args: Record<string, unknown> }>> = {
      liaison: [{ name: "hand_off_intent", args: handoffPayload() }],
      rapporteur: [
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
      // 2026-10-22 第 1 项：Convener 写流程单 + 团队计划并直接发任命卡（不再由 Crew 提名/发卡）。
      convener: [
        { name: "write_file", args: { path: `docs/flows/${FLOW}.md`, content: flowDoc(FLOW, [STEP]) } },
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
      // Crew 只按任命名单写卡（appointment-write → role-card / boundary），不再写 nominations。
      nominator: [
        {
          name: "request_confirmation",
          args: {
            title: `写盘确认 ${FLOW}`,
            preview: "## 角色卡/A/role-card.md\n\n角色卡正文：角色名 A、职责与工作立场。\n## 角色卡/A/boundary.yaml\n\n边界正文：可写目录与目的条目。\n",
            flowId: FLOW,
            cardKind: "appointment-write",
          },
        },
        { name: "write_file", args: { path: "角色卡/A/role-card.md", content: "# 角色：A\n\n由 Crew 写出。\n" } },
        {
          name: "write_file",
          args: {
            path: "角色卡/A/boundary.yaml",
            content: "role: A\nentries:\n  - kind: directory\n    path: src/owned-A/\n    purpose: 角色代码\n",
          },
        },
      ],
      // 2026-10-22 第 3 项：实施派发前由 Proof / 验收写实施前标准。
      verifier: [{ name: "write_file", args: { path: CRITERIA_REL, content: CRITERIA_DOC } }],
    };
    const allCaptured: Captured[] = [];
    const manager = new SessionManager({
      openRoleSession,
      createRuntimeAdapterFactory: () => {
        const captured = capture();
        allCaptured.push(captured);
        return toolAdapterFactory(captured, {
          root,
          scriptForRole: (roleId) => scripts[roleId] ?? [],
        });
      },
      createPiAdapterFactory: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapter: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
      buildProjectConfig: buildConfig,
      getListing: (r) => (r === root ? listing : undefined),
      emitEvent: () => {},
      customerInput,
    });

    // ① Liaison 交接意图。
    assert.equal((await manager.open({ projectRoot: root, roleId: "liaison", runtime: "demo" })).ok, true);
    await manager.send("请把客户意图交给报告员");
    await waitForLedger(root, (list) => list.some((e) => e.kind === "intent.handed-off"));

    // ② Rapporteur 提案 → 客户接受。
    assert.equal((await manager.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" })).ok, true);
    await manager.send("请形成提案并请客户决定");
    await waitForLedger(root, (list) => list.some((e) => e.decisionKind === "proposal-accept"));

    // ③ Convener：写流程单 + 团队计划，并**直接发任命卡**（2026-10-22 第 1 项；不再由 Crew 提名/发卡）。
    assert.equal((await manager.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
    await manager.send("请写团队计划并请客户任命");
    await waitForLedger(root, (list) =>
      list.some((e) => e.decisionKind === "appointment") &&
      list.some((e) => e.kind === "artifact.observed" && e.artifactPath === TEAM_PLAN_REL) &&
      list.some((e) => e.kind === "artifact.observed" && e.artifactPath === `docs/flows/${FLOW}.md`),
    );

    // ④ Crew：按客户任命名单写卡（appointment-write → 角色卡/边界）；不再写成员提名文件。
    assert.equal((await manager.open({ projectRoot: root, roleId: "nominator", runtime: "demo" })).ok, true);
    await manager.send("请按任命名单写卡");
    await waitForLedger(root, (list) => list.some((e) => e.decisionKind === "appointment-write"));
    assert.equal(exists(root, "角色卡/A/role-card.md"), true);
    assert.equal(exists(root, "角色卡/A/boundary.yaml"), true);

    // ⑤ Proof / 验收：实施派发前先写实施前标准（O2 硬门槛）。
    assert.equal((await manager.open({ projectRoot: root, roleId: "verifier", runtime: "demo" })).ok, true);
    await manager.send("请写实施前完成标准");
    for (let attempt = 0; attempt < 100 && !exists(root, CRITERIA_REL); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(exists(root, CRITERIA_REL), true, "实施前标准须在派发前落盘");

    // ⑥ Convener 派发（真实编排包装器 + gate + 桌面 routeDispatch + 账本）。
    const convenerCaps = allCaptured.find((c) => c.boundRoleId === "convener")?.caps;
    assert.ok(convenerCaps?.dispatchTask, "Convener 应获得编排包装后的 dispatchTask");
    const dispatched = await convenerCaps!.dispatchTask!({ roleId: "A", task: "实现 impl", flowId: FLOW, stepId: STEP });
    assert.ok(dispatched, "派发应有回执");
    assert.equal(dispatched!.ok, true, dispatched!.message ?? "");
    await waitForLedger(root, (list) => list.some((e) => e.kind === "dispatch.accepted"));

    // ⑦ 验收（客户级决定收口）：真实 Proof / 验收（verifier）会话 + 验收卡（Draft 不再发 acceptance）。
    const acceptanceCapture = capture();
    const acceptance = await openRoleSession(
      {
        roleId: "verifier",
        project: buildConfig(listing, { accepted: true, source: "test:audit" }),
        taskId: "T-audit-acceptance",
        customerInput: customerChannel({ selected: ["accept"] }),
      },
      {
        createAdapter: toolAdapterFactory(acceptanceCapture, {
          root,
          script: [
            {
              name: "request_choice",
              args: {
                title: `验收 ${FLOW}`,
                question: "验收是否通过？",
                flowId: FLOW,
                cardKind: "acceptance",
                options: [{ id: "accept", label: "接受" }],
              },
            },
          ],
        }),
      },
    );
    await acceptance.send("请发起验收");
    for await (const _ev of acceptance.events()) {
      /* 消费到 settled */
    }
    await acceptance.dispose();
    await manager.stop(null);

    // ⑥ 只读账本还原。
    const { entries, errors } = await readGovernanceLedger(root);
    assert.deepEqual(errors, [], "账本无坏行");
    const audit = reconstruct(entries);
    assert.equal(audit.communicatedBy, "liaison", "谁沟通 = Liaison");
    assert.equal(audit.intent?.intentId, INTENT);
    assert.equal(audit.intent?.handoffKind, "initial");
    assert.equal(audit.intent?.artifactPath, `docs/intents/${INTENT}.md`);
    assert.equal(audit.proposedBy, "rapporteur", "谁提案 = Rapporteur");
    assert.equal(audit.proposalPath, `docs/proposals/${FLOW}-v1.md`);
    assert.equal(audit.teamPlannedBy, "convener", "谁组队/写团队计划 = Convener");
    assert.equal(audit.teamPlanPath, TEAM_PLAN_REL);
    assert.equal(audit.scheduledBy, "convener", "谁排程 = Convener");
    assert.equal(audit.flowPath, `docs/flows/${FLOW}.md`);
    assert.ok(
      audit.customerApprovals.some((c) => c.kind === "proposal-accept" && c.decision === "accepted"),
      "客户批了提案",
    );
    assert.ok(
      audit.customerApprovals.some(
        (c) => c.kind === "appointment" && c.decision === "appointed" && (c.targets ?? []).includes("A"),
      ),
      "客户批了任命 A",
    );
    assert.ok(
      audit.customerApprovals.some((c) => c.kind === "acceptance" && c.decision === "accepted"),
      "客户批了验收",
    );
    assert.equal(audit.dispatchedByConvener, "A", "Convener 派发给了 A");
    // 交接与客户决定不混用：intent.handed-off 不带任何客户决定/证据。
    const handoff = entries.find((e) => e.kind === "intent.handed-off")!;
    assert.equal(handoff.customerDecision, undefined);
    assert.equal(handoff.decisionEvidence, undefined);
    assert.equal(entries.filter((e) => e.kind === "intent.handed-off").length, 1, "同一意图只交接一次");
    const approvals = entries.filter((e) => e.kind === "customer.decision");
    assert.ok(
      approvals.every((e) =>
        e.decisionKind === "intent-confirm"
          ? e.decisionEvidence === undefined // 夹具种入的需求确认（真实路径由客户通道写证据）
          : e.decisionEvidence?.kind === "customer-input",
      ),
      "客户决定一律带应用签发的证据（不是角色自述）",
    );
  } finally {
    cleanup();
  }
});
