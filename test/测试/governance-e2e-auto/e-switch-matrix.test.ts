// test/测试/governance-e2e-auto/e-switch-matrix.test.ts
// 场景 5（离线端到端）：**双开关矩阵**——
//   都关 = 原卡；仅 approval = 写盘族（write/appointment-write/schedule-write）代批；
//   仅 decision = 提案/任命/验收代批；都开 = 全自动；accept-quick 不代批；single/su 不启用。
//
// 通道与判断驱动走真实实现；判断函数在矩阵用例里用桩（只看通道的开关/分组门），
// accept-quick 用例用真实 driver + 假判断会话（复核 driver 的「只代批 accept」机械门槛）。

import test from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  approveOutcome,
  cardFor,
  fakeJudgeFactory,
  judgeContextFor,
  FLOW,
  PROPOSAL_REL,
  write,
} from "./fixture.ts";
import {
  createCustomerInputChannel,
  type CustomerInputRequest,
  type CustomerInputOutcome,
  type OperatorJudgeResultPayload,
  type OperatorRequestPayload,
} from "../../../app/desktop/customer-input.ts";
import { createGovernanceJudge } from "../../../src/pipeline/orchestration/govern-session.ts";
import { proposalDoc } from "./fixture.ts";
import type { GovernanceJudgeContext, GovernanceJudgeFn, GovernanceJudgeRequest } from "../../../src/model/runtime.ts";

type Group = "approval" | "decision";

interface MatrixHarness {
  channel: ReturnType<typeof createCustomerInputChannel>;
  presented: OperatorRequestPayload[];
  rows: OperatorJudgeResultPayload[];
  judgeCalls: GovernanceJudgeRequest[];
  ask(req: CustomerInputRequest, opts?: { governanceModel?: "single" | "trio" }): Promise<{
    outcome: CustomerInputOutcome;
    presented: boolean;
  }>;
}

function makeMatrix(opts: { approval: boolean; decision: boolean; fn?: GovernanceJudgeFn }): MatrixHarness {
  const presented: OperatorRequestPayload[] = [];
  const rows: OperatorJudgeResultPayload[] = [];
  const judgeCalls: GovernanceJudgeRequest[] = [];
  let seq = 0;
  const channel = createCustomerInputChannel({
    operatorId: "test:op",
    presenter: (payload) => presented.push(payload),
    nextId: () => `op-${++seq}`,
    judge: {
      fn:
        opts.fn ??
        (async (request) => {
          judgeCalls.push(request);
          return approveOutcome(request);
        }),
      isGroupEnabled: (group: Group) => (group === "approval" ? opts.approval : opts.decision),
    },
    emitJudgeResult: (payload) => rows.push(payload),
  });
  return {
    channel,
    presented,
    rows,
    judgeCalls,
    async ask(req, askOpts = {}) {
      const before = presented.length;
      const pending = channel.customerInput(req, {
        roleId: "rapporteur",
        runtime: "claude",
        projectRoot: "/proj-matrix",
        governanceModel: askOpts.governanceModel ?? "trio",
      }, {
        turnId: "turn-1",
        toolCallId: "tc-1",
        flowId: FLOW,
        cardKind: req.cardKind,
        judgeContext: judgeContextFor(req) as unknown as GovernanceJudgeContext,
      });
      // 若通道判断为 manual，presenter 已同步推卡；这里立刻给合法回包，避免挂起。
      const presentedNow = presented.length > before;
      if (presentedNow) {
        const id = presented[presented.length - 1]!.id;
        const decision =
          req.kind === "confirm"
            ? ({ kind: "confirm", confirmed: true } as const)
            : ({ kind: "choice", selected: [req.options[0]!.id] } as const);
        const result = channel.respond({ id, decision });
        assert.equal(result.ok, true, result.error ?? "");
      }
      const outcome = await pending;
      return { outcome: outcome as CustomerInputOutcome, presented: presentedNow };
    },
  };
}

test("场景5a：双开关都关 ⇒ 原卡；判断零调用", async () => {
  const m = makeMatrix({ approval: false, decision: false });
  const { outcome, presented } = await m.ask(cardFor("write"));
  assert.equal(presented, true, "都关必须呈现原卡");
  assert.equal(outcome.outcome, "answered", "客户手动作答路径不变");
  assert.equal(m.judgeCalls.length, 0, "开关关 ⇒ 不调用判断");
  assert.equal(m.rows.length, 0);
});

test("场景5b：仅 approval ⇒ 写盘族代批、decision 族仍原卡", async () => {
  const m = makeMatrix({ approval: true, decision: false });
  for (const kind of ["write", "appointment-write", "schedule-write"] as const) {
    const before = m.presented.length;
    const result = await m.ask(cardFor(kind));
    assert.equal(result.presented, false, `${kind}：approval 开 ⇒ 0 卡`);
    assert.equal(m.presented.length, before);
    assert.equal(result.outcome.outcome, "answered");
    assert.equal(result.outcome.operatorId, "judge:claude", `${kind}：代批标注来源`);
  }
  assert.equal(m.judgeCalls.length, 3);
  assert.equal(m.rows.length, 3);
  // decision 族不代批：原卡呈现；开关关 ⇒ 判断零调用。
  const callsBefore = m.judgeCalls.length;
  for (const kind of ["proposal", "appointment", "acceptance"] as const) {
    const result = await m.ask(cardFor(kind));
    assert.equal(result.presented, true, `${kind}：decision 关 ⇒ 原卡`);
  }
  assert.equal(m.judgeCalls.length, callsBefore, "decision 关 ⇒ 判断零调用");
});

test("场景5c：仅 decision ⇒ 提案/任命/验收代批、写盘族仍原卡", async () => {
  const m = makeMatrix({ approval: false, decision: true });
  for (const kind of ["proposal", "appointment", "acceptance"] as const) {
    const result = await m.ask(cardFor(kind));
    assert.equal(result.presented, false, `${kind}：decision 开 ⇒ 0 卡`);
    assert.equal(result.outcome.outcome, "answered");
  }
  const callsBefore = m.judgeCalls.length;
  for (const kind of ["write", "appointment-write", "schedule-write"] as const) {
    const result = await m.ask(cardFor(kind));
    assert.equal(result.presented, true, `${kind}：approval 关 ⇒ 原卡`);
  }
  assert.equal(m.judgeCalls.length, callsBefore);
});

test("场景5d：双开关都开 ⇒ 四类卡全自动（0 卡）", async () => {
  const m = makeMatrix({ approval: true, decision: true });
  const kinds = ["proposal", "appointment", "acceptance", "write", "appointment-write", "schedule-write"] as const;
  for (const kind of kinds) {
    const result = await m.ask(cardFor(kind));
    assert.equal(result.presented, false, `${kind}：双开关开 ⇒ 0 卡`);
    assert.equal(result.outcome.outcome, "answered");
    assert.match(result.outcome.operatorId ?? "", /^judge:/);
  }
  assert.equal(m.presented.length, 0);
  assert.equal(m.rows.length, kinds.length, "每张代批卡一条结果行");
});

test("场景5e：single/su 不启用——即使双开关都开、判断可用，也不代批", async () => {
  const m = makeMatrix({ approval: true, decision: true });
  for (const kind of ["write", "proposal", "appointment", "acceptance"] as const) {
    const result = await m.ask(cardFor(kind), { governanceModel: "single" });
    assert.equal(result.presented, true, `${kind}：single/ su 路径必须原卡`);
  }
  assert.equal(m.judgeCalls.length, 0, "single/su 不调用判断");
  assert.equal(m.rows.length, 0);
});

test("场景5f：accept-quick 不代批——真实 driver 只接受 selected 恰为 [\"accept\"]（manual ⇒ 自动退回）", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-matrix-accept-quick-"));
  try {
    write(root, PROPOSAL_REL, proposalDoc(FLOW));
    const judge = createGovernanceJudge({
      project: { projectRoot: root, skillRoot: root, roles: {} },
      runtime: "claude",
      runtimeOptions: { modelId: "fixture-model" },
      createAdapter: fakeJudgeFactory({
        reportFor: (parsed) => ({
          verdict: "approve",
          group: parsed.group,
          cardKind: parsed.cardKind,
          reason: "离线假模型：试图代批 accept-quick。",
          evidence: [PROPOSAL_REL],
          selected: ["accept-quick"],
        }),
      }),
    });

    const presented: OperatorRequestPayload[] = [];
    const rows: OperatorJudgeResultPayload[] = [];
    let seq = 0;
    const channel = createCustomerInputChannel({
      operatorId: "test:op",
      presenter: (payload) => presented.push(payload),
      nextId: () => `op-${++seq}`,
      judge: { fn: judge, isGroupEnabled: () => true },
      emitJudgeResult: (payload) => rows.push(payload),
    });
    const req = cardFor("proposal");
    const pending = channel.customerInput(req, {
      roleId: "rapporteur",
      runtime: "claude",
      projectRoot: root,
      governanceModel: "trio",
    }, {
      turnId: "turn-1",
      toolCallId: "tc-1",
      flowId: FLOW,
      cardKind: "proposal",
      judgeContext: judgeContextFor(req) as unknown as GovernanceJudgeContext,
    });
    assert.equal(channel.judgingCount(), 1, "判断进行中（不呈现、不计 pending）");
    // 2026-10-19 客户总原则：manual 不再呈现客户卡，直接 declined + 可操作原因回投发起角色。
    const outcome = await pending;
    assert.equal(presented.length, 0, "accept-quick 不得代批，也不得呈现客户卡（自动退回）");
    assert.equal(rows.length, 0, "manual 不产生结果行");
    assert.ok(outcome !== null && outcome !== undefined, "判断运行后应有结算结果");
    assert.equal(outcome.outcome, "declined", "自动退回（非客户作答）");
    const declined = outcome as Extract<CustomerInputOutcome, { outcome: "declined" }>;
    assert.equal(declined.operatorId, "judge:claude", "退回归因为 judge，而非客户");
    assert.match(declined.reason ?? "", /自动决策未通过|自动决策拒绝/, "须说明自动决策未通过/拒绝");
    assert.match(declined.reason ?? "", /重新提交/, "须给出可操作的修正后重试指引");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
