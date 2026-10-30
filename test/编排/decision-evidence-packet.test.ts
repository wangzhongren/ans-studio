// test/编排/decision-evidence-packet.test.ts
// D 批（2026-10-28）：决策判断证据包只从任务/申请上下文与显式物证构造。
//
// 覆盖：
//   · proposal：意图文件 + 提案物证 ⇒ ok；intent.confirmed=true（D 无账本确认态）；
//   · 确定性：同一请求 + 同一盘面 ⇒ 同一 packetSha256；
//   · D 无 flow/ledger/team-plan 门槛：appointment 只靠 recommendedRoleIds；acceptance 不要求流程文件；
//   · 意图缺失 ⇒ fail-closed（intent-missing）；不伪造客户确认。

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { GovernanceJudgeRequest } from "../../src/model/runtime.ts";
import { buildDecisionEvidencePacket } from "../../src/common/编排/governance-judge-evidence.ts";

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-evidence-d-"));
  return fn(root).finally(() => rmSync(root, { recursive: true, force: true }));
}

function writeFile(root: string, rel: string, content: string): void {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

const INTENT = `---
intentId: flow-a
handoffKind: initial
goal: 实现示例能力
scope: 只改编排模块
acceptance: 只验收编排改动
nonGoals: 不改状态机语义
flowId: flow-a
---

# 意图 flow-a

客户原话：「只改编排，不要越界。」
`;

function request(overrides: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return {
    group: "decision",
    cardKind: "proposal",
    roleId: "rapporteur",
    projectRoot: "",
    runtime: "claude",
    governanceModel: "trio",
    flowId: "flow-a",
    toolCallId: "call-1",
    card: {
      kind: "choice",
      title: "是否接受提案 flow-a-v1？",
      options: [
        { id: "accept", label: "接受" },
        { id: "revise", label: "修改" },
      ],
      cardKind: "proposal",
      flowId: "flow-a",
    },
    facts: {
      governanceModel: "trio",
      flowId: "flow-a",
      ledgerErrors: 0,
      unresolvedClarificationCount: 0,
      latestDecisionKinds: [],
    },
    at: new Date(0).toISOString(),
    ...overrides,
  };
}

test("proposal：意图 + 提案物证 ⇒ ok；台账字段为空、intent.confirmed=true", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/intents/flow-a.md", INTENT);
    writeFile(root, "docs/proposals/flow-a-v1.md", "# 提案\n\n## 目标\n实现示例能力。\n");
    const out = await buildDecisionEvidencePacket({
      request: request({ projectRoot: root, artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }),
      projectRoot: root,
    });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.packet.decision.flowId, "flow-a");
    assert.equal(out.packet.intent?.intentId, "flow-a");
    assert.equal(out.packet.intent?.confirmed, true);
    assert.equal(out.packet.mechanicalFacts.ledger.errors, 0);
    assert.deepEqual(out.packet.mechanicalFacts.ledger.flowEntries, []);
    assert.ok(out.packet.evidence.some((entry) => entry.path === "docs/proposals/flow-a-v1.md"));
  });
});

test("确定性：同一请求 + 同一盘面 ⇒ 同一 packetSha256", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/intents/flow-a.md", INTENT);
    writeFile(root, "docs/proposals/flow-a-v1.md", "# 提案\n");
    const req = request({ projectRoot: root, artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } });
    const a = await buildDecisionEvidencePacket({ request: req, projectRoot: root });
    const b = await buildDecisionEvidencePacket({ request: req, projectRoot: root });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok && b.ok) assert.equal(a.packet.integrity.packetSha256, b.packet.integrity.packetSha256);
  });
});

test("D 无 flow/team-plan 门槛：appointment 只靠 recommendedRoleIds；acceptance 不要求流程文件", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/intents/flow-a.md", INTENT);
    const appointment = await buildDecisionEvidencePacket({
      request: request({
        projectRoot: root,
        cardKind: "appointment",
        roleId: "convener",
        card: { kind: "choice", title: "任命", options: [{ id: "alpha", label: "A" }, { id: "beta", label: "B" }], cardKind: "appointment", flowId: "flow-a" },
        recommendedRoleIds: ["alpha", "beta"],
      }),
      projectRoot: root,
    });
    assert.equal(appointment.ok, true);

    writeFile(root, "docs/proposals/flow-a-v1.md", "# 提案\n");
    writeFile(root, "docs/acceptance/flow-a-criteria-v1.md", "# 标准\n");
    writeFile(root, "docs/acceptance/flow-a-report-v1.md", "# 报告\n");
    writeFile(root, "docs/scheduling/flow-a-change-v1.md", "# 变更包\n");
    const acceptance = await buildDecisionEvidencePacket({
      request: request({
        projectRoot: root,
        cardKind: "acceptance",
        roleId: "verifier",
        card: { kind: "choice", title: "验收", options: [{ id: "accept", label: "验收" }, { id: "reject", label: "不验收" }], cardKind: "acceptance", flowId: "flow-a" },
        artifacts: {
          proposalPath: "docs/proposals/flow-a-v1.md",
          acceptanceCriteriaPath: "docs/acceptance/flow-a-criteria-v1.md",
          acceptanceReportPath: "docs/acceptance/flow-a-report-v1.md",
          changePackagePath: "docs/scheduling/flow-a-change-v1.md",
        },
      }),
      projectRoot: root,
    });
    assert.equal(acceptance.ok, true);
  });
});

test("意图缺失 ⇒ intent-missing fail-closed（不得伪造客户确认）", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", "# 提案\n");
    const out = await buildDecisionEvidencePacket({
      request: request({ projectRoot: root, artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }),
      projectRoot: root,
    });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.reasonCode, "intent-missing");
  });
});

const INTENT_V1 = INTENT.replace("intentId: flow-a", "intentId: intent-focus-v1");
const PROPOSAL_WITH_INTENT = [
  "---",
  "schema: project-proposal/v2",
  "flowId: flow-a",
  "version: 1",
  "intentId: intent-focus-v1",
  "intent: docs/product/flow-a-intent-v1.md",
  "---",
  "# 提案",
  "",
].join("\n");

test("§5A 显式 intentId 优先：请求携带 intent-focus-v1 ⇒ packet.source=request", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/intents/intent-focus-v1.md", INTENT_V1);
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_WITH_INTENT);
    const out = await buildDecisionEvidencePacket({
      request: request({
        projectRoot: root,
        intentId: "intent-focus-v1",
        artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
      }),
      projectRoot: root,
    });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.packet.intent?.intentId, "intent-focus-v1");
    assert.equal(out.packet.intent?.source, "request");
    assert.equal(out.packet.intent?.path, "docs/intents/intent-focus-v1.md");
  });
});

test("§5A proposal frontmatter 回退：请求未带 intentId ⇒ packet.source=proposal", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/intents/intent-focus-v1.md", INTENT_V1);
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_WITH_INTENT);
    const out = await buildDecisionEvidencePacket({
      request: request({ projectRoot: root, artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }),
      projectRoot: root,
    });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.packet.intent?.intentId, "intent-focus-v1");
    assert.equal(out.packet.intent?.source, "proposal");
  });
});

test("§5A intentId 不一致 ⇒ intent-ambiguous，拒绝含同源模板与命名规则", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/intents/intent-focus-v1.md", INTENT_V1.replace("intentId: intent-focus-v1", "intentId: intent-other-v1"));
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_WITH_INTENT);
    const out = await buildDecisionEvidencePacket({
      request: request({
        projectRoot: root,
        intentId: "intent-focus-v1",
        artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
      }),
      projectRoot: root,
    });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.reasonCode, "intent-ambiguous");
    assert.match(out.reason, /docs\/intents\/<intentId>\.md/);
    assert.match(out.reason, /intentId: <小写 slug/);
  });
});

test("§5A 无 frontmatter 的纯 Markdown 意图 ⇒ fail-closed，拒绝含模板片段", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/intents/flow-a.md", "# 纯 Markdown 意图\n\n目标：示例\n范围：示例\n验收：示例\n");
    writeFile(root, "docs/proposals/flow-a-v1.md", "# 提案\n");
    const out = await buildDecisionEvidencePacket({
      request: request({ projectRoot: root, intentId: "flow-a", artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }),
      projectRoot: root,
    });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.reasonCode, "intent-missing");
    assert.match(out.reason, /docs\/intents\/<intentId>\.md/);
    assert.match(out.reason, /intentId: <小写 slug/);
    assert.match(out.reason, /acceptance:/);
  });
});

test("§5A 两者都缺席时按 flow-id 回落，但证据保留 source=flow-id（不裸猜）", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/intents/flow-a.md", INTENT);
    writeFile(root, "docs/proposals/flow-a-v1.md", "# 提案\n");
    const out = await buildDecisionEvidencePacket({
      request: request({ projectRoot: root, artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }),
      projectRoot: root,
    });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.packet.intent?.intentId, "flow-a");
    assert.equal(out.packet.intent?.source, "flow-id");
  });
});
