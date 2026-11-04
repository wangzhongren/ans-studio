// test/桌面应用/decision-service.test.ts
// C 批（2026-10-28）：应用申请/决策服务——两开关独立、decision 唯一推荐 deterministic 代选/回落；
// 应用自有 decision 卡不扩大角色允许集；judge 审计不伪装客户。
// 2026-11-04 客户直修：judge「无法核对」类 manual 不自动拒绝（原卡转客户确认）；同卡指纹自动拒绝只发生一次。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createCustomerInputChannel, evaluateDecisionCardRequest, type OperatorJudgeResultPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import type {
  CustomerInputMetadata,
  CustomerInputRequest,
  GovernanceJudgeFn,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
} from "../../src/model/runtime.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

function appDecisionRequest(recommendedCount = 1): CustomerInputRequest {
  const options = [
    { id: "continue", label: "继续" },
    { id: "redispatch", label: "重派", ...(recommendedCount > 1 ? { recommended: true } : {}) },
    { id: "replace", label: "换人" },
    { id: "terminate", label: "终止", ...(recommendedCount >= 1 ? { recommended: true } : {}) },
  ];
  return { kind: "choice", title: "任务升级", cardKind: "decision", application: true, sourceRoleId: "application", flowId: "task-escalation", options };
}

function channelHarness(
  groupEnabled: boolean,
  opts: {
    emitFails?: boolean;
    /** 注入的 judge 结果工厂（缺省按 request 回显 group/cardKind；既有用例不依赖 judge 返回值）。 */
    judge?: (request: GovernanceJudgeRequest) => GovernanceJudgeOutcome;
  } = {},
) {
  const pushed: OperatorRequestPayload[] = [];
  const results: OperatorJudgeResultPayload[] = [];
  let n = 0;
  let judgeCalls = 0;
  const judge: GovernanceJudgeFn = async (request) => {
    judgeCalls += 1;
    if (opts.judge !== undefined) return opts.judge(request);
    return {
      verdict: "approve",
      group: request.group,
      cardKind: request.cardKind,
      engine: request.runtime,
      model: "judge-model",
      reasonCode: "recommended-default",
      selected: ["terminate"],
      durationMs: 1,
    };
  };
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "tester",
    nextId: () => `op-${++n}`,
    judge: { isGroupEnabled: () => groupEnabled, fn: judge },
    emitJudgeResult: (payload) => {
      if (opts.emitFails === true) throw new Error("结果行投达失败");
      results.push(payload);
    },
  });
  return { channel, pushed, results, judgeCalls: () => judgeCalls };
}

const ctx = { roleId: "application", projectRoot: "/p", runtime: "demo" as const, governanceModel: "trio" as const };

test("decision 开关关闭：应用 decision 卡呈现客户，客户手选；无 judge 审计", async () => {
  const h = channelHarness(false);
  const pending = h.channel.customerInput(appDecisionRequest(), ctx);
  assert.equal(h.pushed.length, 1, "开关关闭 ⇒ 原卡呈现");
  assert.equal(h.results.length, 0);
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["redispatch"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, ["redispatch"]);
  assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined);
});

test("decision 开关开启：唯一推荐 deterministic 代选（judge 代批，不呈现卡）", async () => {
  const h = channelHarness(true);
  const outcome = await h.channel.customerInput(appDecisionRequest(), ctx);
  assert.equal(h.pushed.length, 0, "代批成功不呈现客户卡");
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0]!.group, "decision");
  assert.equal(h.results[0]!.cardKind, "decision");
  assert.equal(h.results[0]!.requestTitle, "任务升级", "judge 结果行携带原始申请标题");
  assert.deepEqual(h.results[0]!.selected, ["terminate"]);
  assert.equal(outcome?.outcome, "answered");
  assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, ["terminate"]);
  assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "judge:demo");
  assert.equal(outcome?.outcome === "answered" ? outcome.judge?.group : undefined, "decision");
  assert.equal(outcome?.outcome === "answered" ? outcome.judge?.engine : undefined, "demo");
});

test("结果行投达失败 ⇒ 不擅自代选，回落客户卡", async () => {
  const h = channelHarness(true, { emitFails: true });
  const pending = h.channel.customerInput(appDecisionRequest(), ctx);
  assert.equal(h.pushed.length, 1, "结果行是代批可见性条件：失败 ⇒ 原卡");
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["continue"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined);
});

test("应用自有 decision 卡通过共享校验且不扩大角色允许集；非法推荐数/非应用 chief 仍拒", () => {
  const own = evaluateDecisionCardRequest({ request: appDecisionRequest(), roleId: "application", governanceModel: "trio" });
  assert.equal(own.action, "allow");
  if (own.action === "allow") assert.equal(own.recommendedOptionId, "terminate");

  const bad = evaluateDecisionCardRequest({ request: appDecisionRequest(2), roleId: "application", governanceModel: "trio" });
  assert.equal(bad.action, "reject");
  assert.equal(bad.action === "reject" ? bad.reasonCode : "", "recommended-count");

  const roleOwned = evaluateDecisionCardRequest({ request: { ...appDecisionRequest(), application: undefined, sourceRoleId: undefined }, roleId: "chief", governanceModel: "trio" });
  assert.equal(roleOwned.action, "reject", "chief 不得借应用标志/角色槽位发 decision 卡");
});

// ———————————————— 2026-11-04 客户直修：无法核对升级 / 自动拒绝去重 ————————————————

function proposalRequest(): CustomerInputRequest {
  return {
    kind: "choice",
    title: "确认方案：focus",
    cardKind: "proposal",
    flowId: "focus",
    sourceRoleId: "rapporteur",
    options: [
      { id: "accept", label: "通过" },
      { id: "reject", label: "拒绝" },
    ],
  };
}

const proposalCtx = { roleId: "rapporteur", projectRoot: "/p", runtime: "demo" as const, governanceModel: "trio" as const };
const proposalMetadata: CustomerInputMetadata = {
  cardKind: "proposal",
  judgeContext: {
    flowId: "focus",
    facts: { governanceModel: "trio", flowId: "focus", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] },
  },
};
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

test("① 无法核对（artifact-missing）⇒ 原卡转客户确认，不自动拒绝", async () => {
  const h = channelHarness(true, {
    judge: (request) => ({
      verdict: "manual",
      group: request.group,
      cardKind: request.cardKind,
      engine: request.runtime,
      reasonCode: "artifact-missing",
      reason: "规范物证缺失：docs/proposals/focus-proposal-v1.md（判断无法核对）；请补齐物证后重新提交。",
    }),
  });
  let settled = false;
  const pending = h.channel.customerInput(proposalRequest(), proposalCtx, proposalMetadata);
  Promise.resolve(pending).then(() => {
    settled = true;
  });
  await tick();
  assert.equal(h.pushed.length, 1, "无法核对 ⇒ 原卡呈现客户");
  assert.equal(h.results.length, 0, "不自动拒绝 ⇒ 无结果行");
  assert.equal(settled, false, "卡保持挂起等客户作答");
  assert.equal(h.judgeCalls(), 1, "judge 只运行一次且未自动放行");
  const notice = h.pushed[0]!.judgeNotice ?? "";
  assert.match(notice, /规范物证缺失/, "卡面说明无法核对的原因");
  assert.match(notice, /（判断无法核对）/, "原因保留驱动括注");
  assert.match(notice, /已转你手动确认/, "卡面声明已转客户确认");
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "tester", "客户手批，不是 judge");
});

test("② 可核对卡仍走原有自动判定（approve 结果行 + judge 审计）", async () => {
  const h = channelHarness(true, {
    judge: (request) => ({
      verdict: "approve",
      group: request.group,
      cardKind: request.cardKind,
      engine: request.runtime,
      model: "judge-model",
      reasonCode: "sufficient",
      reason: "意图与提案一致",
      value: { selected: ["accept"] },
      evidence: ["docs/proposals/focus-proposal-v1.md"],
      durationMs: 3,
    }),
  });
  const outcome = await h.channel.customerInput(proposalRequest(), proposalCtx, proposalMetadata);
  assert.equal(outcome?.outcome, "answered");
  assert.equal(h.pushed.length, 0, "代批成功不呈现客户卡");
  assert.equal(h.results.length, 1, "approve 仍发结果行");
  assert.equal(h.results[0]!.group, "decision");
  assert.equal(h.results[0]!.cardKind, "proposal");
  assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "judge:demo");
  assert.equal(outcome?.outcome === "answered" ? outcome.judge?.group : undefined, "decision");
});

test("③ 同卡指纹的自动拒绝只发生一次：重复 ⇒ 原卡转客户", async () => {
  const h = channelHarness(true, {
    judge: (request) => ({
      verdict: "manual",
      group: request.group,
      cardKind: request.cardKind,
      engine: request.runtime,
      reasonCode: "timeout",
      reason: "判断超时（>120s）",
    }),
  });
  const first = await h.channel.customerInput(proposalRequest(), proposalCtx, proposalMetadata);
  assert.equal(first?.outcome, "declined", "首次 manual(timeout) 仍按既有自动退回");
  assert.equal(first?.outcome === "declined" ? first.operatorId : undefined, "judge:demo");
  assert.equal(h.pushed.length, 0, "首次自动退回不呈现客户卡");
  assert.equal(h.judgeCalls(), 1);

  let settled = false;
  const second = h.channel.customerInput(proposalRequest(), proposalCtx, proposalMetadata);
  Promise.resolve(second).then(() => {
    settled = true;
  });
  await tick();
  assert.equal(h.pushed.length, 1, "同指纹第二次 ⇒ 原卡呈现客户");
  assert.equal(settled, false, "卡保持挂起等客户作答");
  assert.equal(h.judgeCalls(), 2, "judge 仍被调用，但结果只能升级客户");
  assert.match(h.pushed[0]!.judgeNotice ?? "", /已转你手动确认/);
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["reject"] } }).ok, true);
  const outcome = await second;
  assert.equal(outcome?.outcome, "answered");
  assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, ["reject"]);
});

test("④ 升级审计：不可核对升级恰记一条 escalated，且不记 manual-as-rework", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ans-decision-escalate-"));
  configureDiagnostics({ directory });
  try {
    const h = channelHarness(true, {
      judge: (request) => ({
        verdict: "manual",
        group: request.group,
        cardKind: request.cardKind,
        engine: request.runtime,
        reasonCode: "artifact-missing",
        reason: "规范物证缺失：docs/proposals/focus-proposal-v1.md（判断无法核对）；请补齐物证后重新提交。",
      }),
    });
    const pending = h.channel.customerInput(proposalRequest(), proposalCtx, proposalMetadata);
    await tick();
    await flushDiagnostics();
    const files = (await fs.readdir(directory)).filter((name) => name.startsWith("ans-diagnostics-") && name.endsWith(".jsonl"));
    const rows = files.flatMap((name) =>
      readFileSync(path.join(directory, name), "utf8")
        .trim()
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    );
    const escalated = rows.filter((row) => row.event === "governance-judge.escalated");
    assert.equal(escalated.length, 1, "恰一条升级审计");
    assert.equal(escalated[0]!.decision, "present-to-customer-unverifiable");
    assert.equal(escalated[0]!.reasonCode, "artifact-missing");
    assert.equal(escalated[0]!.outcome, "manual");
    assert.equal(rows.filter((row) => row.event === "governance-judge.manual-as-rework").length, 0, "升级路径不记自动退回");
    assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["accept"] } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");
  } finally {
    await disposeDiagnostics();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
