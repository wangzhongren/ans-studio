// test/桌面应用/directive-decision.test.ts
// 客户授权平面 C1（B-4）：decision 指令消费者——确定性代选/拒绝、冲突/不匹配绕过默认推荐、
// `once` durable 消费与可见行顺序、坏账本按无指令、指令归属/Q9 三值。
// 使用真实 B1 Pipeline（临时目录账本）+ 桌面客户通道；不启动 Electron、不触网、不写真实 userData。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createCustomerInputChannel,
  type DirectiveDecisionNotice,
  type OperatorJudgeResultPayload,
  type OperatorRequestPayload,
} from "../../app/desktop/customer-input.ts";
import {
  createCustomerDirectiveRuntime,
  type DecisionHooks,
  type DirectivePresenter,
  type SubmitFromInput,
} from "../../src/pipeline/orchestration/customer-directive.ts";
import { CUSTOMER_DIRECTIVES_REL } from "../../src/model/directive.ts";
import type { CustomerInputOutcome, CustomerInputRequest } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

interface RuntimeHarness {
  runtime: ReturnType<typeof createCustomerDirectiveRuntime>;
  presented: string[];
}

function makeRuntime(root: string, sessionId = "session-c1-decision"): RuntimeHarness {
  const presented: string[] = [];
  const runtime = createCustomerDirectiveRuntime({
    projectRoot: root,
    sessionId,
    present: {
      present: async (request) => {
        presented.push(request.requestId);
        return {
          decision: "confirm",
          values: {
            action: request.prefill.action,
            scope: request.prefill.scope,
            until: request.prefill.until,
            ...(request.highRisk.reasons.length > 0 ? { acknowledged: true as const } : {}),
          },
        };
      },
    },
  });
  return { runtime, presented };
}

async function submit(runtime: ReturnType<typeof createCustomerDirectiveRuntime>, root: string, text: string) {
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

function decisionCard(flowId = "focus"): CustomerInputRequest {
  return {
    kind: "choice",
    title: "选择方案",
    question: "请选择",
    cardKind: "decision",
    application: true,
    sourceRoleId: "application",
    flowId,
    options: [
      { id: "alpha", label: "方案 A", recommended: true },
      { id: "beta", label: "方案 B" },
    ],
  };
}

interface ChannelHarness {
  channel: ReturnType<typeof createCustomerInputChannel>;
  pushed: OperatorRequestPayload[];
  judgeResults: OperatorJudgeResultPayload[];
  results: DirectiveDecisionNotice[];
  notices: DirectiveDecisionNotice[];
}

function makeChannel(
  runtime: ReturnType<typeof createCustomerDirectiveRuntime>,
  opts: { decisionEnabled?: boolean; emitResultFails?: boolean } = {},
): ChannelHarness {
  const pushed: OperatorRequestPayload[] = [];
  const judgeResults: OperatorJudgeResultPayload[] = [];
  const results: DirectiveDecisionNotice[] = [];
  const notices: DirectiveDecisionNotice[] = [];
  let n = 0;
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "tester",
    nextId: () => `op-${++n}`,
    judge: {
      isGroupEnabled: () => opts.decisionEnabled === true,
      fn: async (request) => ({
        verdict: "manual",
        group: "decision",
        cardKind: "decision",
        engine: request.runtime,
        reasonCode: "not-used",
      }),
    },
    emitJudgeResult: (payload) => judgeResults.push(payload),
    directive: {
      decisionFacts: () => runtime.decisionFacts(),
      applyDecisionDirective: (_root, card, hooks) => runtime.applyDecisionDirective(card, hooks),
      emitResult: (note) => {
        if (opts.emitResultFails === true) throw new Error("可见行投达失败");
        results.push(note);
      },
      emitNotice: (note) => notices.push(note),
    },
  });
  return { channel, pushed, judgeResults, results, notices };
}

const ctx = { roleId: "chief", projectRoot: "/placeholder", runtime: "demo" as const, governanceModel: "trio" as const };

function context(root: string) {
  return { ...ctx, projectRoot: root };
}

function expectAnswered(outcome: CustomerInputOutcome | null | undefined): Extract<CustomerInputOutcome, { outcome: "answered" }> {
  assert.equal(outcome?.outcome, "answered");
  if (outcome?.outcome !== "answered") throw new Error("期望 answered");
  return outcome;
}

function expectDeclined(outcome: CustomerInputOutcome | null | undefined): Extract<CustomerInputOutcome, { outcome: "declined" }> {
  assert.equal(outcome?.outcome, "declined");
  if (outcome?.outcome !== "declined") throw new Error("期望 declined");
  return outcome;
}

// ————————————————— 1. 代选 / 拒绝 / once 消费 —————————————————

test("decision 指令 select-recommended：代选唯一推荐项（once durable 消费、可见行先投、无 judge 审计）", async () => {
  const t = tempDir("ans-c1-dec-rec-");
  try {
    const { runtime } = makeRuntime(t.dir);
    const created = await submit(runtime, t.dir, "@决策 选推荐项 until=once");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const h = makeChannel(runtime, { decisionEnabled: true });
    const outcome = await h.channel.customerInput(decisionCard(), context(t.dir));
    const answered = expectAnswered(outcome);
    assert.deepEqual(answered.value.selected, ["alpha"]);
    assert.equal(answered.operatorId, `directive:${created.id}`);
    assert.deepEqual(answered.directive, {
      id: created.id,
      action: "select-recommended",
    });
    assert.equal(answered.judge, undefined, "不是 judge 代批");
    assert.equal(h.pushed.length, 0, "指令代选成功不呈现客户卡");
    assert.equal(h.judgeResults.length, 0, "不进入默认推荐 judge");
    assert.equal(h.results.length, 1);
    assert.match(h.results[0]!.summary, /已代选推荐项 方案 A/);
    const facts = runtime.decisionFacts();
    assert.equal(facts.active.length, 0, "once 已 durable 消费");
    const listed = await runtime.list();
    assert.equal(listed.ok, true);
    if (listed.ok) assert.equal(listed.decision.consumed[0]!.id, created.id);
  } finally {
    t.cleanup();
  }
});

test("decision 指令 select-option：按规范化 label 唯一匹配；拒绝按 scope 结算 declined", async () => {
  const t = tempDir("ans-c1-dec-option-");
  try {
    const { runtime } = makeRuntime(t.dir);
    const selected = await submit(runtime, t.dir, "@决策 只接受 方案 B until=once");
    assert.equal(selected.ok, true);
    const h1 = makeChannel(runtime, { decisionEnabled: true });
    const outcome = expectAnswered(await h1.channel.customerInput(decisionCard(), context(t.dir)));
    assert.deepEqual(outcome.value.selected, ["beta"]);
    assert.equal(outcome.directive?.action, "select-option");

    const rejected = await submit(runtime, t.dir, "@决策 拒绝 flow=focus until=once");
    assert.equal(rejected.ok, true);
    const h2 = makeChannel(runtime, { decisionEnabled: true });
    const declined = expectDeclined(await h2.channel.customerInput(decisionCard(), context(t.dir)));
    assert.equal(declined.operatorId, `directive:${rejected.ok ? rejected.id : ""}`);
    assert.deepEqual(declined.directive, {
      id: rejected.ok ? rejected.id : "",
      action: "reject",
    });
    assert.match(declined.reason ?? "", /拒绝/);
    assert.equal(h2.results.length, 1, "拒绝也有可见结果行（先于 durable 消费）");
    assert.equal(h2.judgeResults.length, 0, "不使用默认推荐");
  } finally {
    t.cleanup();
  }
});

test("session 指令可重复应用；once 指令消费后不再生效", async () => {
  const t = tempDir("ans-c1-dec-session-");
  try {
    const { runtime } = makeRuntime(t.dir);
    const session = await submit(runtime, t.dir, "@决策 选推荐项 until=session");
    assert.equal(session.ok, true);
    const h = makeChannel(runtime, { decisionEnabled: true });
    const first = await h.channel.customerInput(decisionCard(), context(t.dir));
    const second = await h.channel.customerInput(decisionCard(), context(t.dir));
    expectAnswered(first);
    expectAnswered(second);
    assert.equal(runtime.decisionFacts().active.length, 1, "session 指令不因消费失效");
    assert.equal((await runtime.list()).ok, true);
  } finally {
    t.cleanup();
  }
});

// ————————————————— 2. 冲突 / 不匹配绕过默认推荐 —————————————————

test("冲突：两条确定指令选区不一致 ⇒ 不消费、绕过默认推荐、呈现客户卡并投说明系统行", async () => {
  const t = tempDir("ans-c1-dec-conflict-");
  try {
    const { runtime } = makeRuntime(t.dir);
    assert.equal((await submit(runtime, t.dir, "@决策 选推荐项 flow=focus until=session")).ok, true);
    assert.equal((await submit(runtime, t.dir, "@决策 只接受 beta flow=focus until=session")).ok, true);
    const h = makeChannel(runtime, { decisionEnabled: true });
    const pending = h.channel.customerInput(decisionCard(), context(t.dir));
    await tick();
    assert.equal(h.pushed.length, 1, "冲突时呈现客户卡");
    assert.equal(h.results.length, 0, "不产生指令生效行");
    assert.equal(h.judgeResults.length, 0, "绕过 tryAutoSelectDecision（即使开关开启）");
    assert.equal(h.notices.length, 1);
    assert.match(h.notices[0]!.summary, /决策指令冲突/);
    assert.equal(runtime.decisionFacts().active.length, 2, "冲突不消费任何一条");
    assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["beta"] } }).ok, true);
    const outcome = expectAnswered(await pending);
    assert.deepEqual(outcome.value.selected, ["beta"]);
  } finally {
    t.cleanup();
  }
});

test("不匹配：select-option 无唯一匹配 ⇒ 不消费、绕过默认推荐、呈现客户卡并投说明系统行", async () => {
  const t = tempDir("ans-c1-dec-nomatch-");
  try {
    const { runtime } = makeRuntime(t.dir);
    assert.equal((await submit(runtime, t.dir, "@决策 只接受 不存在 until=session")).ok, true);
    const h = makeChannel(runtime, { decisionEnabled: true });
    const pending = h.channel.customerInput(decisionCard(), context(t.dir));
    await tick();
    assert.equal(h.pushed.length, 1);
    assert.equal(h.results.length, 0);
    assert.equal(h.judgeResults.length, 0);
    assert.equal(h.notices.length, 1);
    assert.match(h.notices[0]!.summary, /未匹配到唯一选项/);
    assert.equal(runtime.decisionFacts().active.length, 1, "不匹配不消费");
    h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["alpha"] } });
    await pending;
  } finally {
    t.cleanup();
  }
});

// ————————————————— 3. 可见行失败 / 坏账本 —————————————————

test("可见结果行投达失败 ⇒ 不消费、不应用，回落客户卡（有适用指令时不借默认推荐）", async () => {
  const t = tempDir("ans-c1-dec-rowfail-");
  try {
    const { runtime } = makeRuntime(t.dir);
    const created = await submit(runtime, t.dir, "@决策 选推荐项 until=once");
    assert.equal(created.ok, true);
    const h = makeChannel(runtime, { decisionEnabled: true, emitResultFails: true });
    const pending = h.channel.customerInput(decisionCard(), context(t.dir));
    await tick();
    assert.equal(h.pushed.length, 1, "可见行失败 ⇒ 回落客户卡");
    assert.equal(h.judgeResults.length, 0, "有适用指令但不应用 ⇒ 不借默认推荐代选");
    assert.equal(runtime.decisionFacts().active.length, 1, "未 durable 消费");
    assert.equal(h.results.length, 0);
    h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["alpha"] } });
    await pending;
  } finally {
    t.cleanup();
  }
});

test("坏账本（ledgerErrors>0）⇒ 消费者按无指令：既有默认推荐路径不变，不产生指令行", async () => {
  const t = tempDir("ans-c1-dec-badledger-");
  try {
    const ledger = path.join(t.dir, ...CUSTOMER_DIRECTIVES_REL.split("/"));
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, "{not-json\n");
    const { runtime } = makeRuntime(t.dir);
    const h = makeChannel(runtime, { decisionEnabled: true });
    const outcome = expectAnswered(await h.channel.customerInput(decisionCard(), context(t.dir)));
    assert.equal(outcome.operatorId, "judge:demo");
    assert.equal(h.results.length, 0, "坏账本不产生指令生效行");
    assert.equal(h.judgeResults.length, 1, "按无指令 ⇒ 既有默认推荐路径");
    const listed = await runtime.list();
    assert.equal(listed.ok, true);
    if (listed.ok) assert.equal(listed.ledgerErrors > 0, true);
  } finally {
    t.cleanup();
  }
});

// ————————————————— 4. 冻结类型双向可赋值 / 指令归属 —————————————————

test("C1↔B1 冻结类型：SubmitFromInput 必填 decisionGroupEnabled、DecisionHooks 唯一 emitResult、outcome.directive 形状", () => {
  const okSubmit: SubmitFromInput = {
    rawText: "@决策 选推荐项",
    target: "decision",
    projectRoot: "/p",
    roleId: "chief",
    decisionGroupEnabled: true,
  };
  assert.equal(okSubmit.decisionGroupEnabled, true);
  // @ts-expect-error — decisionGroupEnabled 必填、无默认（P1-CAP-04 冻结）
  const missingSwitch: SubmitFromInput = { rawText: "@决策 选推荐项", target: "decision", projectRoot: "/p", roleId: "chief" };
  assert.equal(missingSwitch.rawText, "@决策 选推荐项");
  const hooks: DecisionHooks = { emitResult: () => undefined };
  assert.equal(typeof hooks.emitResult, "function");
  // @ts-expect-error — 无 `deliver` 别名（B1 Revision 1 冻结）
  const wrongHooks: DecisionHooks = { deliver: () => undefined };
  assert.ok(wrongHooks !== undefined);
  const presenter: DirectivePresenter = { present: async () => ({ decision: "cancel" }) };
  assert.equal(typeof presenter.present, "function");
  const outcome: CustomerInputOutcome = {
    outcome: "answered",
    value: { selected: ["alpha"] },
    operatorId: "directive:d-1",
    directive: { id: "d-1", action: "select-option" },
  };
  const answered = expectAnswered(outcome);
  assert.equal(answered.directive?.id, "d-1");
  void tick;
});
