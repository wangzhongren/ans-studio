// test/编排/acceptance-judge-minimal.test.ts
// 2026-10-29（方案 v2.1 §5.1/Q6 A）：验收 judge 的最小链事实——
// 产品意图 + 提案 + 名单（version/hash）+ D3 裁决 + 质检报告存在 ⇒ 可代批 accept；
// 任一缺失 ⇒ manual（fail-closed）；旧 flow 的 proposalDecision/criteria/change-package 门槛已撤除。

import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateGovernanceJudgeVerdict,
  normalizeGovernanceJudgeVerdict,
} from "../../src/common/编排/governance-judge-verdict.ts";
import type { GovernanceJudgeFacts, GovernanceJudgeRequest } from "../../src/model/runtime.ts";

function facts(overrides: Partial<GovernanceJudgeFacts> = {}): GovernanceJudgeFacts {
  return {
    governanceModel: "trio",
    flowId: "focus",
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
    intentDocumentPath: "docs/product/focus-intent-v1.md",
    rosterVersion: 1,
    rosterSha256: "a".repeat(64),
    appointmentDecisionId: "decision-req-d3",
    qualityReportPath: "docs/quality/focus-report-v1.md",
    ...overrides,
  };
}

function request(overrides: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return {
    group: "decision",
    cardKind: "acceptance",
    roleId: "verifier",
    projectRoot: "/proj",
    runtime: "pi",
    governanceModel: "trio",
    flowId: "focus",
    card: {
      kind: "choice",
      title: "验收",
      cardKind: "acceptance",
      flowId: "focus",
      options: [
        { id: "accept", label: "通过", recommended: true },
        { id: "reject", label: "不通过" },
      ],
    },
    facts: facts(),
    artifacts: {
      proposalPath: "docs/proposals/focus-proposal-v1.md",
      acceptanceReportPath: "docs/quality/focus-report-v1.md",
    },
    at: "2026-10-29T00:00:00.000Z",
    ...overrides,
  };
}

function verdict(selected: string[] = ["accept"]) {
  return normalizeGovernanceJudgeVerdict({
    verdict: "approve",
    reason: "最小链事实齐备，范围与意图一致",
    evidence: ["docs/quality/focus-report-v1.md"],
    selected,
  });
}

const stats = {
  readCalls: 2,
  readBytes: 100,
  readPaths: ["docs/proposals/focus-proposal-v1.md", "docs/quality/focus-report-v1.md"],
  deniedReads: 0,
  truncatedReads: 0,
  budgetExceeded: false,
};

test("最小链事实齐备 ⇒ 代批 accept（不要求旧 flow 的 proposalDecision/criteria/change-package）", () => {
  const outcome = evaluateGovernanceJudgeVerdict({
    request: request(),
    verdict: verdict(),
    stats,
    engine: "pi",
  });
  assert.equal(outcome.verdict, "approve");
  assert.deepEqual(outcome.value?.selected, ["accept"]);
});

test("验收模块事实：moduleId/目录/属主随 facts 进入审批（R2/R3）", () => {
  const outcome = evaluateGovernanceJudgeVerdict({
    request: request({
      facts: facts({ moduleId: "impl-core", moduleDirectory: "src/", modulePaths: ["src/"], moduleOwnerRoleId: "implementer" }),
    }),
    verdict: verdict(),
    stats,
    engine: "pi",
  });
  assert.equal(outcome.verdict, "approve");
  assert.deepEqual(outcome.value?.selected, ["accept"]);
});

test("任一最小链事实缺失 ⇒ manual(insufficient-evidence)，reason 指明缺项", () => {
  const cases: Array<[string, GovernanceJudgeFacts, RegExp]> = [
    ["意图文档", facts({ intentDocumentPath: undefined }), /产品意图文档/],
    ["名单版本", facts({ rosterVersion: undefined }), /名单/],
    ["D3 裁决", facts({ appointmentDecisionId: undefined }), /D3/],
    ["质检报告", facts({ qualityReportPath: undefined }), /质检报告/],
  ];
  for (const [name, f, reason] of cases) {
    const outcome = evaluateGovernanceJudgeVerdict({
      request: request({ facts: f }),
      verdict: verdict(),
      stats,
      engine: "pi",
    });
    assert.equal(outcome.verdict, "manual", name);
    assert.equal(outcome.reasonCode, "insufficient-evidence", name);
    assert.match(outcome.reason ?? "", reason, name);
  }
});

test("物证缺失/未读 ⇒ manual（proposal/report 仍为必需物证）", () => {
  const missingArtifact = evaluateGovernanceJudgeVerdict({
    request: request({ artifacts: { acceptanceReportPath: "docs/quality/focus-report-v1.md" } }),
    verdict: verdict(),
    stats,
    engine: "pi",
  });
  assert.equal(missingArtifact.verdict, "manual");
  assert.equal(missingArtifact.reasonCode, "artifact-missing");
  // 2026-11-01（acceptance-evidence-path AC-3/AC-4）：缺 proposal 的文案指向约定路径
  // `docs/proposals/<flowId>-proposal-v1.md`，不得再出现旧错误约定 `docs/proposals/<flowId>-v1.md`。
  const missingReason = missingArtifact.reason ?? "";
  assert.match(missingReason, /docs\/proposals\/focus-proposal-v1\.md/);
  assert.ok(!missingReason.includes("focus-v1.md"), missingReason);

  const notRead = evaluateGovernanceJudgeVerdict({
    request: request(),
    verdict: verdict(),
    stats: { ...stats, readPaths: ["docs/proposals/focus-proposal-v1.md"] },
    engine: "pi",
  });
  assert.equal(notRead.verdict, "manual");
  assert.equal(notRead.reasonCode, "artifact-not-read");
});
