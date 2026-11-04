// test/编排/download-judge.test.ts
// B1（2026-11-04 download-requests）：下载判断集成（W-6/W-7 + F4 verdict）。
//
// 覆盖 AC-5/24/25（B1 侧）：
//   · requiredArtifactPaths("download") => {paths:[],missing:false}；
//   · verdict download approve 要求 confirm+confirmed:true，返回 {confirmed:true} 且无 paths/pathDecisions；
//   · download-facts-missing 保留为 manual reasonCode；卡片分组 approval；
//   · 系统 rubric/请求提示渲染 request.download + 合成归属。

import test from "node:test";
import assert from "node:assert/strict";

import type { DownloadJudgeFacts } from "../../src/model/download.ts";
import type { GovernanceJudgeFacts, GovernanceJudgeRequest } from "../../src/model/runtime.ts";
import { governanceCardGroup } from "../../src/model/runtime.ts";
import { requiredArtifactPaths } from "../../src/common/编排/governance-judge-facts.ts";
import {
  buildGovernanceJudgePrompt,
  buildGovernanceJudgeSystemPrompt,
} from "../../src/common/编排/governance-judge-prompt.ts";
import {
  evaluateGovernanceJudgeVerdict,
  normalizeGovernanceJudgeVerdict,
} from "../../src/common/编排/governance-judge-verdict.ts";
import { isUnverifiableRejectionCode } from "../../src/common/编排/mechanical-rejection.ts";

function downloadFacts(): DownloadJudgeFacts {
  return {
    url: "https://example.com/report.pdf",
    scheme: "https",
    host: "example.com",
    resolvedIps: ["93.184.216.34"],
    resolvedIpsTotal: 1,
    resolvedIpsTruncated: false,
    filename: "report.pdf",
    filenameSource: "url-basename",
    purpose: "读取报告",
    maxBytes: 104_857_600,
    mechanical: {
      schemeOk: true,
      credentialsAbsent: true,
      hostPublic: true,
      ipsPublic: true,
      filenameSafe: true,
    },
  };
}

function facts(): GovernanceJudgeFacts {
  return {
    governanceModel: "trio",
    flowId: "download",
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
  };
}

function request(overrides: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return {
    group: "approval",
    cardKind: "download",
    roleId: "X",
    projectRoot: "/proj",
    runtime: "pi",
    governanceModel: "trio",
    flowId: "download",
    toolCallId: "tc-1",
    turnId: "turn-1",
    card: {
      kind: "confirm",
      title: "下载文件申请",
      cardKind: "download",
      preview: "https://example.com/report.pdf",
      flowId: "download",
    },
    facts: facts(),
    download: downloadFacts(),
    at: "2026-11-04T00:00:00.000Z",
    ...overrides,
  };
}

function approveVerdict(confirmed = true) {
  return normalizeGovernanceJudgeVerdict({
    verdict: "approve",
    reason: "用途与 URL 相符，mechanical 全部通过",
    evidence: ["download:host=example.com"],
    confirmed,
  });
}

test("W-6：requiredArtifactPaths('download') 返回 missing:false（不要求固定物证）", () => {
  assert.deepEqual(requiredArtifactPaths(request()), { paths: [], missing: false });
});

test("F4 verdict：download approve 要求 confirmed:true；返回 {confirmed:true} 且无 paths/pathDecisions", () => {
  const outcome = evaluateGovernanceJudgeVerdict({ request: request(), verdict: approveVerdict(), engine: "pi" });
  assert.equal(outcome.verdict, "approve", JSON.stringify(outcome));
  assert.equal(outcome.cardKind, "download");
  assert.equal(outcome.value?.confirmed, true);
  assert.equal(outcome.value?.selected, undefined);
  assert.equal(outcome.paths, undefined);
  assert.equal(outcome.pathDecisions, undefined);

  const missingConfirm = evaluateGovernanceJudgeVerdict({
    request: request(),
    verdict: approveVerdict(false),
    engine: "pi",
  });
  assert.equal(missingConfirm.verdict, "manual");
  assert.equal(missingConfirm.reasonCode, "not-recommended");
});

test("F4：未知卡种不再把 download 压成 group-mismatch；manual download-facts-missing 保留且属「无法核对」", () => {
  const manual = evaluateGovernanceJudgeVerdict({
    request: request(),
    verdict: normalizeGovernanceJudgeVerdict({
      verdict: "manual",
      reasonCode: "download-facts-missing",
      reason: "缺少 request.download 事实",
    }),
    engine: "pi",
  });
  assert.equal(manual.verdict, "manual");
  assert.equal(manual.reasonCode, "download-facts-missing");
  assert.equal(isUnverifiableRejectionCode("download-facts-missing"), true);
  assert.equal(governanceCardGroup("download"), "approval");
});

test("W-7：系统 rubric 含下载段与「不得访问 URL」；请求提示渲染 request.download 与合成归属", () => {
  const system = buildGovernanceJudgeSystemPrompt();
  assert.match(system, /下载申请/);
  assert.match(system, /不得尝试访问 URL/);
  assert.match(system, /download-facts-missing/);
  assert.match(system, /合成归属/);
  const prompt = buildGovernanceJudgePrompt(request());
  assert.match(prompt, /下载申请事实/);
  assert.ok(prompt.includes('"host":"example.com"'));
  assert.match(prompt, /flowId=download 是合成归属/);
});
