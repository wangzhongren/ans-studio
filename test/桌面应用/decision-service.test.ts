// test/桌面应用/decision-service.test.ts
// C 批（2026-10-28）：应用申请/决策服务——两开关独立、decision 唯一推荐 deterministic 代选/回落；
// 应用自有 decision 卡不扩大角色允许集；judge 审计不伪装客户。
import test from "node:test";
import assert from "node:assert/strict";

import { createCustomerInputChannel, evaluateDecisionCardRequest, type OperatorJudgeResultPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import type { GovernanceJudgeFn, CustomerInputRequest } from "../../src/model/runtime.ts";

function appDecisionRequest(recommendedCount = 1): CustomerInputRequest {
  const options = [
    { id: "continue", label: "继续" },
    { id: "redispatch", label: "重派", ...(recommendedCount > 1 ? { recommended: true } : {}) },
    { id: "replace", label: "换人" },
    { id: "terminate", label: "终止", ...(recommendedCount >= 1 ? { recommended: true } : {}) },
  ];
  return { kind: "choice", title: "任务升级", cardKind: "decision", application: true, sourceRoleId: "application", flowId: "task-escalation", options };
}

function channelHarness(groupEnabled: boolean, opts: { emitFails?: boolean } = {}) {
  const pushed: OperatorRequestPayload[] = [];
  const results: OperatorJudgeResultPayload[] = [];
  let n = 0;
  const judge: GovernanceJudgeFn = async (request) => ({
    verdict: "approve",
    group: "decision",
    cardKind: "decision",
    engine: request.runtime,
    model: "judge-model",
    reasonCode: "recommended-default",
    selected: ["terminate"],
    durationMs: 1,
  });
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
  return { channel, pushed, results };
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
