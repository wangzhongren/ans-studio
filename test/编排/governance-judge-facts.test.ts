// test/编排/governance-judge-facts.test.ts
// 2026-11-01（acceptance-evidence-path 方案 P1.2 §3.2/§5.1；V1 AC-4）：
// `requiredArtifactPaths` 的提案缺失文案使用 `docs/proposals/<flowId>-proposal-v1.md`
// （flowId 缺失时为「提案」，不编造路径）；任何结果都不得出现旧错误约定
// `docs/proposals/<flowId>-v1.md`。本函数不扫盘、不做版本选择：实际版本路径由 app 传入，
// 缺失文案只是约定命名（与 mechanical-rejection/workflow-preconditions/governance-judge-prompt 同源）。
// `expectedQualityReport` 不变：`docs/quality/<flowId>-report-v1.md`。

import test from "node:test";
import assert from "node:assert/strict";

import { requiredArtifactPaths } from "../../src/common/编排/governance-judge-facts.ts";
import type { GovernanceJudgeFacts, GovernanceJudgeRequest } from "../../src/model/runtime.ts";

function facts(overrides: Partial<GovernanceJudgeFacts> = {}): GovernanceJudgeFacts {
  return {
    governanceModel: "trio",
    flowId: "focus",
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
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
    at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

test("acceptance 缺 proposal（报告已给）⇒ missingPaths 恰为 docs/proposals/focus-proposal-v1.md", () => {
  const result = requiredArtifactPaths(
    request({
      cardKind: "acceptance",
      artifacts: { acceptanceReportPath: "docs/quality/focus-report-v1.md" },
    }),
  );
  assert.equal(result.missing, true);
  assert.deepEqual(result.missingPaths, ["docs/proposals/focus-proposal-v1.md"]);
  assert.deepEqual(result.paths, ["docs/quality/focus-report-v1.md"]);
});

test("proposal 卡缺 proposal ⇒ missingPaths 恰为 docs/proposals/focus-proposal-v1.md", () => {
  const result = requiredArtifactPaths(request({ cardKind: "proposal", artifacts: {} }));
  assert.equal(result.missing, true);
  assert.deepEqual(result.missingPaths, ["docs/proposals/focus-proposal-v1.md"]);
  assert.deepEqual(result.paths, []);
});

test("flowId 缺失 ⇒ 缺失文案为「提案」/「质检报告」，不编造路径", () => {
  const acceptance = requiredArtifactPaths(
    request({
      flowId: "",
      cardKind: "acceptance",
      artifacts: { acceptanceReportPath: "docs/quality/focus-report-v1.md" },
    }),
  );
  assert.equal(acceptance.missing, true);
  assert.deepEqual(acceptance.missingPaths, ["提案"]);

  const proposal = requiredArtifactPaths(request({ flowId: "   ", cardKind: "proposal", artifacts: {} }));
  assert.equal(proposal.missing, true);
  assert.deepEqual(proposal.missingPaths, ["提案"]);

  const noReport = requiredArtifactPaths(
    request({
      flowId: "",
      cardKind: "acceptance",
      artifacts: { proposalPath: "docs/proposals/focus-proposal-v1.md" },
    }),
  );
  assert.equal(noReport.missing, true);
  assert.deepEqual(noReport.missingPaths, ["质检报告"]);
});

test("expectedQualityReport 回归：仍为 docs/quality/<flowId>-report-v1.md", () => {
  const missingReport = requiredArtifactPaths(
    request({
      cardKind: "acceptance",
      artifacts: { proposalPath: "docs/proposals/focus-proposal-v1.md" },
    }),
  );
  assert.equal(missingReport.missing, true);
  assert.deepEqual(missingReport.missingPaths, ["docs/quality/focus-report-v1.md"]);
  assert.deepEqual(missingReport.paths, ["docs/proposals/focus-proposal-v1.md"]);
});

test("不扫盘/不做版本选择：显式给出但磁盘不存在的路径视为已给（missing=false）", () => {
  const result = requiredArtifactPaths(
    request({
      cardKind: "proposal",
      artifacts: { proposalPath: "docs/proposals/focus-proposal-v9.md" },
    }),
  );
  assert.equal(result.missing, false);
  assert.deepEqual(result.paths, ["docs/proposals/focus-proposal-v9.md"]);
});

test("任何结果都不含旧错误约定 docs/proposals/focus-v1.md", () => {
  const results = [
    requiredArtifactPaths(request({ cardKind: "acceptance", artifacts: {} })),
    requiredArtifactPaths(request({ cardKind: "acceptance", artifacts: { acceptanceReportPath: "docs/quality/focus-report-v1.md" } })),
    requiredArtifactPaths(request({ cardKind: "acceptance", artifacts: { proposalPath: "docs/proposals/focus-proposal-v1.md" } })),
    requiredArtifactPaths(request({ cardKind: "proposal", artifacts: {} })),
    requiredArtifactPaths(request({ cardKind: "proposal", artifacts: { proposalPath: "docs/proposals/focus-proposal-v1.md" } })),
    requiredArtifactPaths(request({ flowId: "", cardKind: "acceptance", artifacts: {} })),
    requiredArtifactPaths(request({ flowId: "", cardKind: "proposal", artifacts: {} })),
  ];
  for (const result of results) {
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("docs/proposals/focus-v1.md"), serialized);
  }
});
