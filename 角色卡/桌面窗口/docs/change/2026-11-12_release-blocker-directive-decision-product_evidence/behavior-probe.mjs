// 2026-11-12 发布阻断 B3-1 产品修复独立行为探针。
// 目的：不依赖 `test/桌面应用/directive-decision.test.ts`（用例 8 期望过时、由测试角色统一更新），
// 直接经真实 `createCustomerInputChannel` + 真实 B1 指令运行时（临时目录账本）证明：
//   A. 非主权 decision 卡 + `@决策` 指令 ⇒ 指令被消费（不呈现客户、无 judge/默认推荐、产生 request/actionSource）。
//   B. 无适用指令 + 幕僚委托开启 ⇒ 仍走幕僚分支（chief 结算，不呈现客户）。
//   C. 无适用指令 + 幕僚委托关闭 ⇒ 仍回落客户卡（客户本人作答）。
//   D. 应用主权卡（run-change）+ `@决策` 指令 ⇒ 指令不消费、仍呈现客户（`isApplicationDecisionReservedForCustomer` 语义不变）。
// 只读运行：临时目录、不启动 Electron、不触网、不写真实 userData。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createCustomerInputChannel } from "../../../../../app/desktop/customer-input.ts";
import { createCustomerDirectiveRuntime } from "../../../../../src/pipeline/orchestration/customer-directive.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
/** 防 before 态（指令消费者不可达）无声挂起：超时即失败并如实报出。 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: 等待 ${ms}ms 未结算（指令未消费 / 卡未呈现，符合 before 缺陷表现）`)),
      ms,
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
const dirs = [];
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
process.on("exit", () => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function makeRuntime(root, sessionId) {
  return createCustomerDirectiveRuntime({
    projectRoot: root,
    sessionId,
    present: {
      present: async (request) => ({
        decision: "confirm",
        values: {
          action: request.prefill.action,
          scope: request.prefill.scope,
          until: request.prefill.until,
          ...(request.highRisk.reasons.length > 0 ? { acknowledged: true } : {}),
        },
      }),
    },
  });
}

async function submit(runtime, root, text) {
  const result = await runtime.submitFromInput({
    rawText: text,
    target: "decision",
    projectRoot: root,
    roleId: "chief",
    runtime: "demo",
    decisionGroupEnabled: true,
  });
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result;
}

function makeChannel({ runtime, delegation, decisionEnabled = true }) {
  const pushed = [];
  const judgeResults = [];
  const results = [];
  const notices = [];
  let n = 0;
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "tester",
    nextId: () => `probe-${++n}`,
    judge: {
      isGroupEnabled: () => decisionEnabled,
      fn: async () => ({
        verdict: "manual",
        group: "decision",
        cardKind: "decision",
        engine: "demo",
        reasonCode: "not-used",
      }),
    },
    emitJudgeResult: (payload) => judgeResults.push(payload),
    ...(delegation !== undefined ? { delegation } : {}),
    ...(runtime !== undefined
      ? {
          directive: {
            decisionFacts: () => runtime.decisionFacts(),
            applyDecisionDirective: (_root, card, hooks) => runtime.applyDecisionDirective(card, hooks),
            emitResult: (note) => results.push(note),
            emitNotice: (note) => notices.push(note),
          },
        }
      : {}),
  });
  return { channel, pushed, judgeResults, results, notices };
}

function decisionCard() {
  return {
    kind: "choice",
    title: "选择方案",
    question: "请选择",
    cardKind: "decision",
    application: true,
    sourceRoleId: "application",
    flowId: "focus",
    options: [
      { id: "alpha", label: "方案 A", recommended: true },
      { id: "beta", label: "方案 B" },
    ],
  };
}

function runChangeCard() {
  return {
    kind: "choice",
    title: "运行方式",
    question: "请选择",
    cardKind: "decision",
    application: true,
    sourceRoleId: "application",
    flowId: "focus",
    options: [
      { id: "continue-frozen", label: "继续冻结", recommended: true },
      { id: "stop-and-restart", label: "停止并重启" },
      { id: "stop", label: "停止" },
    ],
  };
}

const context = (root, extra = {}) => ({
  roleId: "chief",
  projectRoot: root,
  runtime: "demo",
  governanceModel: "trio",
  ...extra,
});

function delegationSwitch(enabled) {
  return {
    get: () => ({ enabled, revision: 0 }),
    subscribe: () => () => undefined,
  };
}

// ————— A. 指令命中：非主权 decision 卡被指令消费，不呈现客户 —————
{
  const root = tempDir("ans-b31-probe-a-");
  const runtime = makeRuntime(root, "session-b31-probe-a");
  const created = await submit(runtime, root, "@决策 选推荐项 until=once");
  const h = makeChannel({ runtime });
  const out = await withTimeout(h.channel.customerInput(decisionCard(), context(root)), 3000, "A");
  assert.equal(out?.outcome, "answered", "A: 指令代选应结算 answered");
  assert.deepEqual(out.value.selected, ["alpha"], "A: 选中推荐项");
  assert.equal(out.operatorId, `directive:${created.id}`, "A: operatorId 归指令，不是客户/judge");
  assert.deepEqual(out.directive, { id: created.id, action: "select-recommended" }, "A: 产生 directive actionSource");
  assert.equal(out.judge, undefined, "A: 不是 judge 代批");
  assert.equal(h.pushed.length, 0, "A: 指令命中不呈现客户卡");
  assert.equal(h.judgeResults.length, 0, "A: 不进入 judge/默认推荐");
  assert.equal(h.results.length, 1, "A: 恰一条可见指令结果行");
  assert.equal(runtime.decisionFacts().active.length, 0, "A: once 已 durable 消费");
  console.log("A PASS  指令命中：answered / directive:<id> / 不呈现客户 / 无 judge / once 已消费");
}

// ————— B. 无适用指令 + 委托开启：仍走幕僚分支（chief 结算） —————
{
  const root = tempDir("ans-b31-probe-b-");
  const runtime = makeRuntime(root, "session-b31-probe-b");
  const basis = {
    baseDigest: "a".repeat(64),
    evidenceRefs: [{ snapshotId: "probe-snap", path: "docs/evidence.md", sha256: "b".repeat(64) }],
    context: "# evidence",
    isCurrent: async () => true,
  };
  const host = {
    prepare: async () => basis,
    execute: async (execContext, _evidence, decide) => {
      const result = await decide({
        requestId: execContext.request.requestId,
        baseDigest: execContext.request.baseDigest,
        delegationRevision: execContext.request.delegationRevision,
        disposition: "select",
        selected: ["alpha"],
        reason: "probe chief select",
      });
      assert.equal(result.ok, true, "B: chief decide 应成功");
    },
  };
  const h = makeChannel({ runtime, delegation: delegationSwitch(true) });
  const out = await h.channel.customerInput(decisionCard(), context(root, { chiefDecision: host }));
  assert.equal(out?.outcome, "answered", "B: 幕僚分支结算 answered");
  assert.equal(out.operatorId, "chief", "B: 由幕僚代决策（不是指令）");
  assert.equal(out.actionSource?.kind, "chief-delegated", "B: chief-delegated actionSource 保留");
  assert.equal(out.directive, undefined, "B: 无指令命中，不伪造 directive");
  assert.equal(h.pushed.length, 0, "B: chief 决定不呈现客户卡");
  assert.equal(h.results.length, 0, "B: 无指令结果行");
  console.log("B PASS  未命中指令：仍走幕僚分支（operatorId=chief / 不呈现客户）");
}

// ————— C. 无适用指令 + 委托关闭：仍回落客户卡 —————
{
  const root = tempDir("ans-b31-probe-c-");
  const runtime = makeRuntime(root, "session-b31-probe-c");
  const h = makeChannel({ runtime });
  const pending = h.channel.customerInput(decisionCard(), context(root));
  await tick(50);
  assert.equal(h.pushed.length, 1, "C: 无指令 ⇒ 呈现客户卡");
  assert.equal(h.results.length, 0, "C: 无指令结果行");
  assert.equal(h.notices.length, 0, "C: 无冲突/不匹配说明行");
  const responded = h.channel.respond({
    id: h.pushed[0].id,
    decision: { kind: "choice", selected: ["beta"] },
  });
  assert.equal(responded.ok, true, "C: 客户可作答");
  const out = await pending;
  assert.equal(out?.outcome, "answered", "C: 客户作答结算");
  assert.deepEqual(out.value.selected, ["beta"], "C: 客户选择生效");
  console.log("C PASS  未命中指令：仍回落客户卡（客户本人作答）");
}

// ————— D. 应用主权卡 + 指令：指令不消费、仍呈现客户 —————
{
  const root = tempDir("ans-b31-probe-d-");
  const runtime = makeRuntime(root, "session-b31-probe-d");
  const created = await submit(runtime, root, "@决策 选推荐项 flow=focus until=session");
  const h = makeChannel({ runtime });
  const pending = h.channel.customerInput(runChangeCard(), context(root));
  await tick(50);
  assert.equal(h.pushed.length, 1, "D: 主权卡仍呈现客户");
  assert.equal(h.results.length, 0, "D: 指令不得代选");
  assert.equal(h.notices.length, 0, "D: 不产生指令说明行");
  assert.equal(runtime.decisionFacts().active.length, 1, "D: 指令未被消费");
  h.channel.respond({ id: h.pushed[0].id, decision: { kind: "choice", selected: ["continue-frozen"] } });
  const out = await pending;
  assert.equal(out?.outcome, "answered", "D: 客户本人作答");
  assert.equal(out.directive, undefined, "D: 不伪造 directive 归属");
  assert.equal(created.ok, true);
  console.log("D PASS  主权卡排除语义不变：指令不消费、仍呈现客户");
}

console.log("B3-1 PROBE PASS (4/4 cases)");
