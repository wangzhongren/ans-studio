// test/编排/decision-evidence-packet.test.ts
// 治理卡判断 agent 证据包（DecisionEvidencePacket）的确定性测试（2026-10-19 客户新反馈）。
//
// 覆盖：
//   · 证据包是确定性函数（同一请求 + 同一盘面 ⇒ 同一 packetSha256）；
//   · 写盘卡：新文件完整正文 / 改文件旧哈希 + 变更摘要；preview 自由文本不是内容权威；
//   · 提案/提名/验收物证：sha256 + 关键片段（架构/验收标准/候选角色/流程步骤）；
//   · 请求方陈述与系统事实冲突（flowId/推荐集/账本漂移）⇒ manual；
//   · 路径探测失败/缺失、关键物证缺失/不可读 ⇒ manual；
//   · 判断期间哈希漂移 ⇒ approve 降 manual/evidence-hash-mismatch；
//   · 定点抽查最小集（多文件写卡不要求读全部）；证据包有界（超大正文截断后不得 approve）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CustomerInputRequest,
  GovernanceJudgeFacts,
  GovernanceJudgeRequest,
  RuntimeKind,
  WriteGate,
} from "../../src/model/runtime.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import { createGovernanceJudge } from "../../src/common/编排/governance-judge.ts";
import {
  buildDecisionEvidencePacket,
  DECISION_EVIDENCE_BODY_MAX_BYTES,
  DECISION_EVIDENCE_PACKET_MAX_BYTES,
  DECISION_EVIDENCE_SPOT_CHECK_LIMIT,
  verifyEvidenceHashes,
} from "../../src/common/编排/governance-judge-evidence.ts";

// —————————————————————— 夹具 ——————————————————————

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-evidence-packet-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

function writeFile(root: string, rel: string, content = "内容\n"): void {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// 2026-10-19 定位修正：decision 组判断前必须有客户已确认的意图（intent-confirm accepted）。
const INTENT_REL = "docs/intents/intent-a.md";

function seedIntent(root: string, over: { flowId?: string; goal?: string; scope?: string; acceptance?: string } = {}): void {
  writeFile(
    root,
    INTENT_REL,
    [
      "---",
      "intentId: intent-a",
      "handoffKind: initial",
      `goal: ${over.goal ?? "实现示例能力"}`,
      `scope: ${over.scope ?? "只改编排"}`,
      `acceptance: ${over.acceptance ?? "证据包测试通过"}`,
      "nonGoals: 不重写架构",
      "customerWords: 客户说：只改编排，别扩范围。",
      `flowId: ${over.flowId ?? "flow-a"}`,
      "---",
      "",
      "# 意图 intent-a",
      "",
      "客户原话摘录：「只改编排，别扩范围。」",
      "",
    ].join("\n"),
  );
}

function seedIntentLedger(root: string, input: { flowId?: string; intentId?: string; decision?: "accepted" | "changes-requested"; extraLines?: readonly string[] } = {}): void {
  const flowId = input.flowId ?? "flow-a";
  const intentId = input.intentId ?? "intent-a";
  const lines = [JSON.stringify({
    at: "2026-10-19T00:00:00.000Z",
    kind: "customer.decision",
    flowId,
    actorRoleId: "liaison",
    power: "liaison",
    decisionKind: "intent-confirm",
    customerDecision: input.decision ?? "accepted",
    decisionEvidence: { kind: "customer-input" },
  }), JSON.stringify({
    at: "2026-10-19T00:00:01.000Z",
    kind: "intent.handed-off",
    flowId,
    actorRoleId: "liaison",
    power: "liaison",
    intentId,
    handoffKind: "initial",
  }), ...(input.extraLines ?? [])];
  writeFile(root, ".ans/governance/ledger.jsonl", `${lines.join("\n")}\n`);
}

/** 验收卡账本：意图确认 + 交接 + 提案接受 + 逐步骤 dispatch.accepted。 */
function seedAcceptanceLedger(root: string, stepIds: readonly string[] = ["impl"]): void {
  seedIntentLedger(root, {
    extraLines: [
      JSON.stringify({
        at: "2026-10-19T00:00:02.000Z",
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "rapporteur",
        power: "proposal",
        decisionKind: "proposal-accept",
        customerDecision: "accepted",
        decisionEvidence: { kind: "customer-input" },
      }),
      ...stepIds.map((stepId, index) => JSON.stringify({
        at: new Date(Date.UTC(2026, 9, 19, 0, 0, 3 + index)).toISOString(),
        kind: "dispatch.accepted",
        flowId: "flow-a",
        stepId,
        actorRoleId: "app",
        power: "app",
      })),
    ],
  });
}

/** 验收卡判断请求（flow 物证路径可切换 YAML / legacy Markdown）。 */
function acceptanceRequest(root: string, flowPath: string): GovernanceJudgeRequest {
  return {
    group: "decision",
    cardKind: "acceptance",
    roleId: "verifier",
    projectRoot: root,
    runtime: "claude",
    governanceModel: "trio",
    flowId: "flow-a",
    card: {
      kind: "choice",
      title: "验收 flow-a",
      options: [{ id: "accept", label: "验收" }],
      cardKind: "acceptance",
      flowId: "flow-a",
    },
    artifacts: { proposalPath: "docs/proposals/flow-a-v1.md", flowPath },
    facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["impl"] }),
    at: new Date().toISOString(),
  };
}

const FLOW_STATE_YAML = `flowId: flow-a
version: 1
qualityTier: production
steps:
  - id: impl
    title: 实现
    owner: backend
    kind: dispatch
    status: done
    evidence: { kind: dispatch, ref: impl }
  - id: verification
    title: 验收
    owner: verifier
    kind: acceptance
    status: pending
`;

function facts(over: Partial<GovernanceJudgeFacts> = {}): GovernanceJudgeFacts {
  return {
    governanceModel: "trio",
    flowId: "flow-a",
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
    ...over,
  };
}

const PROPOSAL_MARKDOWN = [
  "# 提案 flow-a v1",
  "",
  "## 目标",
  "实现示例能力。",
  "",
  "## 范围",
  "只改编排。",
  "",
  "## 验收标准",
  "- 证据包含 sha256。",
  "- 写盘卡正文可核对。",
  "",
  "## 架构方案",
  "模块分解：evidence 模块只做确定性提取。",
  "依赖方向：driver → evidence → facts，无环。",
  "扩展点：新增卡种时扩展 artifact 分类。",
  "数据与契约：无 schema 变化。",
  "横切关注点：日志归编排。",
  "权衡：有界证据包优先于全量读取。",
  "",
].join("\n");

function proposalRequest(root: string, over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return {
    group: "decision",
    cardKind: "proposal",
    roleId: "rapporteur",
    projectRoot: root,
    runtime: "claude",
    governanceModel: "trio",
    flowId: "flow-a",
    card: {
      kind: "choice",
      title: "是否接受提案 flow-a-v1？",
      options: [{ id: "accept", label: "接受" }, { id: "revise", label: "修改" }],
      cardKind: "proposal",
      flowId: "flow-a",
    },
    artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    facts: facts(),
    at: new Date().toISOString(),
    ...over,
  };
}

function writeRequest(root: string, paths: readonly string[], preview: string, over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  const flowId = over.flowId ?? "flow-a";
  const card: CustomerInputRequest = {
    kind: "confirm",
    title: "写盘确认",
    preview,
    cardKind: (over.cardKind as CustomerInputRequest["cardKind"]) ?? "write",
    flowId,
  };
  return {
    group: "approval",
    cardKind: "write",
    roleId: "rapporteur",
    projectRoot: root,
    runtime: "claude",
    governanceModel: "trio",
    flowId,
    card,
    paths: [...paths],
    pathProbes: paths.map((entry) => ({ path: entry, allowed: true })),
    allowedPathRoots: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    forbiddenPaths: [".ans/", "角色卡/", "docs/nominations/", "docs/flows/"],
    facts: facts({ flowId }),
    at: new Date().toISOString(),
    ...over,
    ...(over.card !== undefined ? { card: over.card } : {}),
  };
}

function bodyFor(path: string, text: string): string {
  return `## ${path}\n\n${text}`;
}

// —————————————————————— ① 确定性 + 写盘内容 ——————————————————————

test("证据包是确定性函数：同一请求 + 同一盘面 ⇒ 同一 packetSha256；改文件带旧哈希/变更摘要", async () => {
  await withRoot(async (root) => {
    const target = "docs/proposals/flow-a-v2.md";
    writeFile(root, target, "# 旧版\n\n旧正文。\n");
    const preview = `${bodyFor(target, "# 新版\n\n新正文 A。\n新正文 B。")}\n`;
    const request = writeRequest(root, [target], preview);

    const first = await buildDecisionEvidencePacket({ request, projectRoot: root });
    const second = await buildDecisionEvidencePacket({ request, projectRoot: root });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.packet.integrity.packetSha256, second.packet.integrity.packetSha256, "同一盘面同一哈希");
    assert.deepEqual(first.packet, second.packet);
    assert.match(first.packet.integrity.packetSha256, /^[0-9a-f]{64}$/);

    const declared = first.packet.declaredPaths[0]!;
    assert.equal(declared.path, target);
    assert.equal(declared.target.exists, true);
    assert.equal(declared.target.sha256, sha256("# 旧版\n\n旧正文。\n"));
    assert.equal(declared.declaredContent.available, true);
    if (!declared.declaredContent.available) return;
    assert.equal(declared.declaredContent.provenance, "request_confirmation.preview");
    assert.equal(declared.declaredContent.body, "# 新版\n\n新正文 A。\n新正文 B。");
    assert.equal(declared.declaredContent.change.kind, "modify");
    assert.equal(declared.declaredContent.change.oldSha256, declared.target.sha256);
    assert.ok(declared.declaredContent.change.addedLines >= 3);
    assert.equal(first.packet.integrity.contentSourceOfTruth, "request_confirmation");
  });
});

test("写盘卡：新文件给完整正文；preview 自由文本（无逐路径正文）不是内容权威 ⇒ manual", async () => {
  await withRoot(async (root) => {
    const target = "docs/proposals/new.md";
    const body = "# 新提案\n\n完整正文。\n";
    const ok = await buildDecisionEvidencePacket({
      request: writeRequest(root, [target], bodyFor(target, body)),
      projectRoot: root,
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const content = ok.packet.declaredPaths[0]!.declaredContent;
    assert.equal(content.available, true);
    if (!content.available) return;
    assert.equal(content.body, "# 新提案\n\n完整正文。");
    assert.equal(content.complete, true);
    assert.equal(content.change.kind, "create");

    // 旧式自由 preview（只声明路径、无逐路径正文）⇒ 证据包不完整，driver 不得 approve。
    const legacy = await buildDecisionEvidencePacket({
      request: writeRequest(root, [target], `将写入 ${target}，正文见提案。`),
      projectRoot: root,
    });
    assert.equal(legacy.ok, false);
    if (legacy.ok) return;
    assert.equal(legacy.reasonCode, "insufficient-evidence");
    assert.match(legacy.reason, /待写正文/);
  });
});

// —————————————————————— ② 物证（提案/提名/验收） ——————————————————————

test("提案证据：意图摘要 + 提案范围/验收片段；requiredRead 为意图+提案（最小抽查）", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    seedIntent(root);
    seedIntentLedger(root);
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const proposal = built.packet.evidence.find((entry) => entry.kind === "proposal")!;
    assert.equal(proposal.sha256, sha256(PROPOSAL_MARKDOWN));
    assert.ok(proposal.excerpts.some((excerpt) => excerpt.label.includes("范围")));
    assert.ok(proposal.excerpts.some((excerpt) => excerpt.label.includes("验收标准")));
    assert.equal(
      proposal.excerpts.some((excerpt) => /架构/.test(excerpt.label)),
      false,
      "decision 组不需要架构片段（架构由 Proof 核对）",
    );

    // 意图是 decision 组的唯一基准：goal/scope/acceptance/非目标/客户原话 + 客户确认态。
    assert.ok(built.packet.intent, "decision 包必须含意图段");
    const intent = built.packet.intent!;
    assert.equal(intent.intentId, "intent-a");
    assert.equal(intent.path, INTENT_REL);
    assert.equal(intent.source, "ledger");
    assert.equal(intent.confirmed, true);
    assert.equal(intent.goal, "实现示例能力");
    assert.equal(intent.scope, "只改编排");
    assert.equal(intent.acceptance, "证据包测试通过");
    assert.equal(intent.nonGoals, "不重写架构");
    assert.match(intent.customerWords ?? "", /只改编排/);
    assert.ok(intent.excerpts.some((excerpt) => /客户原话/.test(excerpt.label)));

    assert.deepEqual(built.requiredReadPaths, [INTENT_REL, "docs/proposals/flow-a-v1.md"], "最小抽查集=意图+提案");
    assert.ok(built.packet.mechanicalFacts.ledger.flowEntries.length >= 2, "意图确认/交接进入账本事实");
  });
});

test("任命证据：提名推荐集进入角色枚举；与应用推荐集不一致 ⇒ evidence-conflict", async () => {
  await withRoot(async (root) => {
    writeFile(
      root,
      "docs/nominations/flow-a-v1.md",
      "# 提名\n\n推荐：alpha、beta\n\n## 候选角色\n\n| 角色 | 理由 |\n| --- | --- |\n| alpha | A |\n| beta | B |\n",
    );
    seedIntent(root);
    seedIntentLedger(root);
    const base: GovernanceJudgeRequest = {
      group: "decision",
      cardKind: "appointment",
      roleId: "nominator",
      projectRoot: root,
      runtime: "claude",
      governanceModel: "trio",
      flowId: "flow-a",
      card: {
        kind: "choice",
        title: "任命角色",
        options: [{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }],
        multiple: true,
        cardKind: "appointment",
        flowId: "flow-a",
      },
      recommendedRoleIds: ["alpha", "beta"],
      artifacts: { nominationPath: "docs/nominations/flow-a-v1.md" },
      facts: facts(),
      at: new Date().toISOString(),
    };
    const ok = await buildDecisionEvidencePacket({ request: base, projectRoot: root });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const nomination = ok.packet.evidence.find((entry) => entry.kind === "nomination")!;
    assert.deepEqual(nomination.recommendedRoleIds, ["alpha", "beta"]);
    assert.deepEqual(ok.packet.mechanicalFacts.roles.recommendedRoleIds, ["alpha", "beta"]);
    assert.deepEqual(ok.packet.mechanicalFacts.roles.cardOptionIds, ["alpha", "beta"]);
    assert.equal(ok.packet.intent?.intentId, "intent-a");
    assert.deepEqual(ok.requiredReadPaths, [INTENT_REL, "docs/nominations/flow-a-v1.md"], "意图 + 提名摘要");

    const drift = await buildDecisionEvidencePacket({
      request: { ...base, recommendedRoleIds: ["alpha"] },
      projectRoot: root,
    });
    assert.equal(drift.ok, false);
    if (drift.ok) return;
    assert.equal(drift.reasonCode, "evidence-conflict");
    assert.match(drift.reason, /提名文件重解析/);
  });
});

test("验收证据：流程步骤 + 账本记录；facts 与重读账本不一致 ⇒ evidence-conflict", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    writeFile(root, "docs/flows/flow-a.md", "# 流程\n\n| stepId | 步骤 | 状态 |\n| --- | --- | --- |\n| s1 | 实现 | done |\n");
    seedIntent(root);
    writeFile(root, ".ans/governance/ledger.jsonl", `${JSON.stringify({
      at: "2026-10-19T00:00:00.000Z",
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "liaison",
      power: "liaison",
      decisionKind: "intent-confirm",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
    })}\n${JSON.stringify({
      at: "2026-10-19T00:00:00.500Z",
      kind: "intent.handed-off",
      flowId: "flow-a",
      actorRoleId: "liaison",
      power: "liaison",
      intentId: "intent-a",
      handoffKind: "initial",
    })}\n${JSON.stringify({
      at: "2026-10-19T00:00:01.000Z",
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "rapporteur",
      power: "proposal",
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
    })}\n${JSON.stringify({
      at: "2026-10-19T00:00:02.000Z",
      kind: "dispatch.accepted",
      flowId: "flow-a",
      stepId: "s1",
      actorRoleId: "app",
      power: "app",
    })}\n`);
    const base: GovernanceJudgeRequest = {
      group: "decision",
      cardKind: "acceptance",
      roleId: "verifier",
      projectRoot: root,
      runtime: "claude",
      governanceModel: "trio",
      flowId: "flow-a",
      card: {
        kind: "choice",
        title: "验收 flow-a",
        options: [{ id: "accept", label: "验收" }],
        cardKind: "acceptance",
        flowId: "flow-a",
      },
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md", flowPath: "docs/flows/flow-a.md" },
      facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"] }),
      at: new Date().toISOString(),
    };
    const ok = await buildDecisionEvidencePacket({ request: base, projectRoot: root });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const flow = ok.packet.evidence.find((entry) => entry.kind === "flow")!;
    assert.deepEqual(flow.steps, [{ id: "s1", status: "done" }]);
    assert.equal(ok.packet.mechanicalFacts.ledger.proposalDecision, "accepted");
    assert.deepEqual(ok.packet.mechanicalFacts.ledger.dispatchedStepIds, ["s1"]);
    assert.equal(ok.packet.intent?.confirmed, true);
    assert.deepEqual(ok.requiredReadPaths, [INTENT_REL, "docs/proposals/flow-a-v1.md"], "意图 + 提案摘要");

    const drift = await buildDecisionEvidencePacket({
      request: { ...base, facts: facts({ proposalDecision: "revise", dispatchedStepIds: ["s1"] }) },
      projectRoot: root,
    });
    assert.equal(drift.ok, false);
    if (drift.ok) return;
    assert.equal(drift.reasonCode, "evidence-conflict");
    assert.match(drift.reason, /proposalDecision/);
  });
});

// —————————————— 2026-10-19：Flow YAML 证据包（YAML-only 验收不再误判） ——————————————

test("验收证据（YAML-only）：流程状态解析出步骤，不报『缺少可解析的步骤表』", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    writeFile(root, "docs/flows/flow-a.yaml", FLOW_STATE_YAML);
    seedIntent(root);
    seedAcceptanceLedger(root, ["impl"]);

    const built = await buildDecisionEvidencePacket({
      request: acceptanceRequest(root, "docs/flows/flow-a.yaml"),
      projectRoot: root,
    });
    assert.equal(built.ok, true, built.ok ? "" : built.reason);
    if (!built.ok) return;

    const flow = built.packet.evidence.find((entry) => entry.kind === "flow")!;
    assert.deepEqual(flow.steps, [
      { id: "impl", status: "done" },
      { id: "verification", status: "pending" },
    ]);
    assert.ok(
      !built.packet.integrity.problems.some((problem) => /流程单缺少可解析的步骤表/.test(problem)),
      "YAML-only 流程不得被误报为缺少步骤表",
    );
    assert.ok(
      flow.excerpts.some((excerpt) => excerpt.label === "流程状态 YAML" && excerpt.text.includes("flowId: flow-a")),
      "YAML 应给出结构化摘要片段",
    );
    assert.ok(!flow.excerpts.some((excerpt) => /未解析/.test(excerpt.label)), "YAML 不应标为未解析");
  });
});

test("验收证据（YAML 非法）：flow-state-invalid 带具体 path/message，仍 fail-closed", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    writeFile(
      root,
      "docs/flows/flow-a.yaml",
      FLOW_STATE_YAML.replace("    status: done", "    status: in-progress"),
    );
    seedIntent(root);
    seedAcceptanceLedger(root, ["impl"]);

    const built = await buildDecisionEvidencePacket({
      request: acceptanceRequest(root, "docs/flows/flow-a.yaml"),
      projectRoot: root,
    });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "flow-state-invalid");
    assert.match(built.reason, /steps\[0\]\.status/);
    assert.match(built.reason, /in-progress/);
    assert.doesNotMatch(built.reason, /流程单缺少可解析的步骤表/);
  });
});

test("验收证据（legacy Markdown）：仍走原步骤表解析与旧失败文案", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    writeFile(root, "docs/flows/flow-a.md", "# 流程\n\n| stepId | 步骤 | 状态 |\n| --- | --- | --- |\n| impl | 实现 | done |\n");
    seedIntent(root);
    seedAcceptanceLedger(root, ["impl"]);

    const built = await buildDecisionEvidencePacket({
      request: acceptanceRequest(root, "docs/flows/flow-a.md"),
      projectRoot: root,
    });
    assert.equal(built.ok, true, built.ok ? "" : built.reason);
    if (!built.ok) return;
    const flow = built.packet.evidence.find((entry) => entry.kind === "flow")!;
    assert.deepEqual(flow.steps, [{ id: "impl", status: "done" }]);

    // 不可解析的 legacy Markdown 仍保留旧文案。
    writeFile(root, "docs/flows/flow-a.md", "# 流程\n\n没有步骤表。\n");
    const legacy = await buildDecisionEvidencePacket({
      request: acceptanceRequest(root, "docs/flows/flow-a.md"),
      projectRoot: root,
    });
    assert.equal(legacy.ok, false);
    if (legacy.ok) return;
    assert.equal(legacy.reasonCode, "insufficient-evidence");
    assert.match(legacy.reason, /流程单缺少可解析的步骤表/);
  });
});

test("decision 卡：意图缺失/未确认/歧义 ⇒ 直接 fail-closed（不调用模型）", async () => {
  // ① 没有意图文件（账本也没有交接）⇒ intent-missing
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "intent-missing");
    assert.match(built.reason, /意图文件不可读/);
  });

  // ② 意图未经客户确认（最后一条 intent-confirm=changes-requested）⇒ intent-unconfirmed
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    seedIntent(root);
    seedIntentLedger(root, { decision: "changes-requested" });
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "intent-unconfirmed");
    assert.match(built.reason, /intent-confirm/);
  });

  // ②b 先 accepted、后改口 changes-requested ⇒ 旧 accepted 不得放行（取最后一条）
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    seedIntent(root);
    seedIntentLedger(root, {
      decision: "accepted",
      extraLines: [JSON.stringify({
        at: "2026-10-19T00:00:02.000Z",
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "liaison",
        power: "liaison",
        decisionKind: "intent-confirm",
        customerDecision: "changes-requested",
        decisionEvidence: { kind: "customer-input" },
      })],
    });
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "intent-unconfirmed");
  });

  // ③ 同一 flow 关联多个不同意图 ⇒ intent-ambiguous
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    seedIntent(root);
    seedIntent(root, { flowId: "flow-a" });
    writeFile(root, "docs/intents/intent-b.md", "# 另一个意图\n");
    seedIntentLedger(root, {
      extraLines: [JSON.stringify({
        at: "2026-10-19T00:00:02.000Z",
        kind: "intent.handed-off",
        flowId: "flow-a",
        actorRoleId: "liaison",
        power: "liaison",
        intentId: "intent-b",
        handoffKind: "initial",
      })],
    });
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "intent-ambiguous");
    assert.match(built.reason, /多个意图/);
  });

  // ④ 意图文件 flowId 与请求不一致 ⇒ intent-ambiguous
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    seedIntent(root, { flowId: "flow-b" });
    seedIntentLedger(root);
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "intent-ambiguous");
    assert.match(built.reason, /flowId=flow-b/);
  });
});

test("意图定位兼容：提案 frontmatter intentId / docs/intents/<flowId>.md 均可作为基准", async () => {
  // ① 无交接账本，提案 frontmatter 给出 intentId；客户确认按 flowId 记录。
  await withRoot(async (root) => {
    writeFile(
      root,
      "docs/proposals/flow-a-v1.md",
      `---\nflowId: flow-a\nintentId: intent-a\n---\n\n${PROPOSAL_MARKDOWN}`,
    );
    seedIntent(root);
    seedIntentLedger(root);
    // 只保留 intent-confirm（去掉 handoff），验证 proposal frontmatter 兜底。
    const ledgerPath = ".ans/governance/ledger.jsonl";
    writeFile(root, ledgerPath, `${JSON.stringify({
      at: "2026-10-19T00:00:00.000Z",
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "liaison",
      power: "liaison",
      decisionKind: "intent-confirm",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
    })}\n`);
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.packet.intent?.source, "proposal");
    assert.equal(built.packet.intent?.intentId, "intent-a");
  });

  // ② 无交接、提案无 intentId ⇒ docs/intents/<flowId>.md 兜底；确认按 flowId 记录。
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    seedIntent(root, { flowId: "flow-a" });
    writeFile(root, "docs/intents/flow-a.md", `${[
      "---",
      "intentId: flow-a",
      "handoffKind: initial",
      "goal: 实现示例能力",
      "scope: 只改编排",
      "acceptance: 证据包测试通过",
      "---",
      "",
      "客户原话摘录：「只改编排，别扩范围。」",
      "",
    ].join("\n")}`);
    writeFile(root, ".ans/governance/ledger.jsonl", `${JSON.stringify({
      at: "2026-10-19T00:00:00.000Z",
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "liaison",
      power: "liaison",
      decisionKind: "intent-confirm",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
    })}\n`);
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.packet.intent?.source, "flow-id");
    assert.equal(built.packet.intent?.intentId, "flow-a");
    assert.equal(built.packet.intent?.path, "docs/intents/flow-a.md");
  });
});

test("旧意图值（S2/T15）：账本/提案中非空非法 intentId 显式 fail-closed，不静默跳过或回落", async () => {
  // ① 账本 intent.handed-off 的 intentId 尾连字符（旧值）⇒ intent-unconfirmed，detail 点名旧值与现行规则。
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    seedIntent(root);
    seedIntentLedger(root, { intentId: "intent-" });
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "intent-unconfirmed");
    assert.match(built.reason, /账本 intent\.handed-off 的 intentId（intent-）/);
    assert.match(built.reason, /0,62/, "detail 须展示现行正则");
  });

  // ② 提案 frontmatter 的 intentId 尾连字符（无交接账本）⇒ 不得静默回落 `docs/intents/<flowId>.md`。
  await withRoot(async (root) => {
    writeFile(
      root,
      "docs/proposals/flow-a-v1.md",
      `---\nflowId: flow-a\nintentId: intent-\n---\n\n${PROPOSAL_MARKDOWN}`,
    );
    seedIntent(root);
    writeFile(root, ".ans/governance/ledger.jsonl", `${JSON.stringify({
      at: "2026-10-19T00:00:00.000Z",
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "liaison",
      power: "liaison",
      decisionKind: "intent-confirm",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
    })}\n`);
    const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "intent-unconfirmed");
    assert.match(built.reason, /提案 frontmatter 的 intentId「intent-」/);
    assert.match(built.reason, /不得静默回落/);
  });
});

// —————————————————————— ③ 冲突 / fail-closed ——————————————————————

test("请求方陈述与系统事实冲突：卡片 flowId 与请求 flowId 不一致 ⇒ evidence-conflict", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    seedIntent(root);
    seedIntentLedger(root);
    const request = proposalRequest(root);
    const card: CustomerInputRequest = {
      kind: "choice",
      title: "接受提案",
      options: [{ id: "accept", label: "接受" }],
      cardKind: "proposal",
      flowId: "flow-b",
    };
    const built = await buildDecisionEvidencePacket({
      request: { ...request, card },
      projectRoot: root,
    });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "evidence-conflict");
    assert.match(built.reason, /card-flow-mismatch/);
  });
});

test("路径探测失败/缺失 ⇒ path-outside-boundary / path-unverified（不调用模型）", async () => {
  await withRoot(async (root) => {
    const target = "docs/proposals/x.md";
    const preview = bodyFor(target, "# 正文\n");
    const denied = writeRequest(root, [target], preview, {
      pathProbes: [{ path: target, allowed: false, reason: "越界" }],
    });
    const deniedResult = await buildDecisionEvidencePacket({ request: denied, projectRoot: root });
    assert.equal(deniedResult.ok, false);
    if (!deniedResult.ok) assert.equal(deniedResult.reasonCode, "path-outside-boundary");

    const missing = writeRequest(root, [target], preview, { pathProbes: [] });
    const missingResult = await buildDecisionEvidencePacket({ request: missing, projectRoot: root });
    assert.equal(missingResult.ok, false);
    if (!missingResult.ok) assert.equal(missingResult.reasonCode, "path-unverified");
  });
});

test("关键物证缺失/不可读 ⇒ artifact-missing（driver 直接 manual，模型不调用）", async () => {
  await withRoot(async (root) => {
    let binds = 0;
    const factory: RuntimeAdapterFactory = () => ({
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole() {
        binds += 1;
        throw new Error("不应调用模型");
      },
    });
    const judge = createGovernanceJudge({
      project: { projectRoot: root, skillRoot: root, roles: {} },
      runtime: "claude",
      createAdapter: factory,
      timeoutMs: 200,
    });
    const out = await judge(proposalRequest(root));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "artifact-missing");
    assert.match(out.reason ?? "", /docs\/proposals\/flow-a-v1\.md/);
    assert.equal(binds, 0, "证据包缺失不调用模型");
  });
});

// —————————————————————— ④ 哈希漂移（driver 集成） ——————————————————————

test("判断期间物证变化 ⇒ approve 降 manual/evidence-hash-mismatch", async () => {
  await withRoot(async (root) => {
    const proposalPath = "docs/proposals/flow-a-v1.md";
    writeFile(root, proposalPath, PROPOSAL_MARKDOWN);
    seedIntent(root);
    seedIntentLedger(root);

    const seen: { prompts: string[]; disposed: number } = { prompts: [], disposed: 0 };
    const factory: RuntimeAdapterFactory = (_gate: WriteGate, capabilities?: AdapterCapabilities) => ({
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole() {
        return {
          async prompt(text: string) {
            seen.prompts.push(text);
            // 判断期间篡改物证：approve 前 hash 复核必须发现。
            writeFile(root, proposalPath, `${PROPOSAL_MARKDOWN}\n额外内容（判断期间写入）。\n`);
            const stats = capabilities?.governanceJudge?.stats;
            if (stats !== undefined) stats.readPaths = [INTENT_REL, proposalPath];
            capabilities?.governanceJudge?.report({
              verdict: "approve",
              reason: "证据包与物证一致。",
              evidence: [proposalPath],
              selected: ["accept"],
            });
          },
          async *events() {
            yield { kind: "settled" as const, summary: "settled" };
          },
          async dispose() {
            seen.disposed += 1;
          },
          async abort() {},
        };
      },
    });
    const judge = createGovernanceJudge({
      project: { projectRoot: root, skillRoot: root, roles: {} },
      runtime: "claude",
      createAdapter: factory,
      timeoutMs: 500,
    });
    const out = await judge(proposalRequest(root));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "evidence-hash-mismatch");
    assert.match(out.reason ?? "", /判断期间发生变化/);
    assert.ok(seen.prompts[0]!.includes("DecisionEvidencePacket"), "提示词包含系统证据包");
  });
});

test("verifyEvidenceHashes：基线路径消失或内容变化均不通过", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/a.md", "A\n");
    const baseline = { "docs/proposals/a.md": sha256("A\n") };
    assert.deepEqual(await verifyEvidenceHashes(baseline, root), { ok: true });
    writeFile(root, "docs/proposals/a.md", "B\n");
    const changed = await verifyEvidenceHashes(baseline, root);
    assert.equal(changed.ok, false);
    if (!changed.ok) assert.match(changed.reason, /发生变化/);
    const gone = await verifyEvidenceHashes({ "docs/proposals/none.md": sha256("x") }, root);
    assert.equal(gone.ok, false);
    if (!gone.ok) assert.match(gone.reason, /消失/);
  });
});

// —————————————————————— ⑤ 有界 + 定点抽查 ——————————————————————

test("定点抽查是最小集：6 个已存在目标 + 1 个提案 ⇒ 仍只要求 ≤2 条", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_MARKDOWN);
    writeFile(root, ".ans/governance/ledger.jsonl", `${JSON.stringify({
      at: "2026-10-19T00:00:00.000Z",
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "nominator",
      power: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
      targetRoleIds: ["a"],
      decisionEvidence: { kind: "customer-input" },
    })}\n`);
    const targets = [
      "角色卡/a/role-card.md",
      "角色卡/a/boundary.yaml",
      "角色卡/a/memo.md",
      "角色卡/a/api-spec.md",
      "角色卡/a/changelog.md",
      "角色卡/a/feature-map.md",
    ];
    for (const target of targets) writeFile(root, target, `# ${target}\n\n- 条目\n`);
    const preview = targets.map((target) => bodyFor(target, `# ${target}\n\n新内容。`)).join("\n\n");
    const built = await buildDecisionEvidencePacket({
      request: writeRequest(root, targets, preview, {
        cardKind: "appointment-write",
        roleId: "nominator",
        allowedPathRoots: ["角色卡/"],
        forbiddenPaths: [".ans/", "角色卡/governance-boundary.yaml", "角色卡/rapporteur/", "角色卡/su/"],
        artifacts: { nominationPath: "docs/nominations/flow-a-v1.md" },
        facts: facts({ appointmentTargetRoleIds: ["a"] }),
      }),
      projectRoot: root,
    });
    assert.equal(built.ok, false, "缺少提名物证 ⇒ artifact-missing（没有提名文件）");
    if (!built.ok) assert.equal(built.reasonCode, "artifact-missing");

    // 补上提名文件后：证据包含 6 条目标哈希，但 requiredRead 只有 ≤2 条。
    writeFile(root, "docs/nominations/flow-a-v1.md", "# 提名\n\n推荐：a\n");
    const built2 = await buildDecisionEvidencePacket({
      request: writeRequest(root, targets, preview, {
        cardKind: "appointment-write",
        roleId: "nominator",
        allowedPathRoots: ["角色卡/"],
        forbiddenPaths: [".ans/", "角色卡/governance-boundary.yaml", "角色卡/rapporteur/", "角色卡/su/"],
        artifacts: { nominationPath: "docs/nominations/flow-a-v1.md" },
        facts: facts({ appointmentTargetRoleIds: ["a"] }),
      }),
      projectRoot: root,
    });
    assert.equal(built2.ok, true);
    if (!built2.ok) return;
    assert.equal(built2.packet.declaredPaths.length, targets.length);
    assert.ok(
      built2.packet.declaredPaths.every((entry) => entry.target.exists && /^[0-9a-f]{64}$/.test(entry.target.sha256 ?? "")),
      "全部目标文件哈希在证据包内",
    );
    assert.ok(built2.requiredReadPaths.length <= DECISION_EVIDENCE_SPOT_CHECK_LIMIT, "定点抽查 ≤2");
    assert.ok(
      built2.requiredReadPaths.every((path) => path === "docs/nominations/flow-a-v1.md" || targets.includes(path)),
      "抽查只取已存在物证/目标",
    );
    assert.ok(built2.packet.integrity.packetBytes <= DECISION_EVIDENCE_PACKET_MAX_BYTES);
  });
});

test("证据包不跟随符号链接：物证是指向项目外的链接 ⇒ artifact-missing（不泄露外部内容）", async () => {
  if (process.platform === "win32") return; // Windows 创建符号链接需要额外权限；该守卫在 macOS/Linux 覆盖。
  await withRoot(async (root) => {
    const outside = mkdtempSync(join(tmpdir(), "ans-evidence-outside-"));
    try {
      writeFileSync(join(outside, "secret.md"), "# 项目外内容\n", "utf8");
      mkdirSync(join(root, "docs", "proposals"), { recursive: true });
      symlinkSync(join(outside, "secret.md"), join(root, "docs", "proposals", "flow-a-v1.md"));
      const built = await buildDecisionEvidencePacket({ request: proposalRequest(root), projectRoot: root });
      assert.equal(built.ok, false);
      if (built.ok) return;
      assert.equal(built.reasonCode, "artifact-missing");
      assert.doesNotMatch(built.reason, /项目外内容/, "不泄露链接目标内容");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("证据包不读敏感路径：物证指向 .env ⇒ artifact-missing（不泄露凭据）", async () => {
  await withRoot(async (root) => {
    writeFile(root, ".env", "ANS_SECRET_SENTINEL=DO_NOT_LEAK\n");
    const built = await buildDecisionEvidencePacket({
      request: proposalRequest(root, { artifacts: { proposalPath: ".env" } }),
      projectRoot: root,
    });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "artifact-missing");
    assert.doesNotMatch(built.reason, /DO_NOT_LEAK/);
  });
});

test("证据包有界：超大有界正文截断 complete=false ⇒ manual/insufficient-evidence", async () => {
  await withRoot(async (root) => {
    const target = "docs/proposals/huge.md";
    const huge = `# 超大正文\n\n${"x".repeat(DECISION_EVIDENCE_BODY_MAX_BYTES + 1024)}`;
    const built = await buildDecisionEvidencePacket({
      request: writeRequest(root, [target], bodyFor(target, huge)),
      projectRoot: root,
    });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.reasonCode, "insufficient-evidence");
    assert.match(built.reason, /有界上限/);
  });
});
