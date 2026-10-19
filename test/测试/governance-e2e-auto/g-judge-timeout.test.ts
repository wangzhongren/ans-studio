// test/测试/governance-e2e-auto/g-judge-timeout.test.ts
// 场景 7（离线端到端）：**判断超时**——默认 120s、环境变量覆盖、超时回落该组原卡（manual + judgeNotice）。
//
// 超时硬门槛由真实 `createGovernanceJudge` driver 产生（假判断会话沉默不交回结论）；
// 为避免真等 120s，覆盖用例把环境变量设为几十毫秒（解析函数本身另行逐值核对）。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEFAULT_GOVERNANCE_JUDGE_TIMEOUT_MS,
  GOVERNANCE_JUDGE_TIMEOUT_ENV,
  resolveGovernanceJudgeTimeoutMs,
} from "../../../src/common/编排/governance-judge.ts";
import { createGovernanceJudge } from "../../../src/pipeline/orchestration/govern-session.ts";
import {
  cardFor,
  fakeJudgeFactory,
  FLOW,
  judgeContextFor,
  PROPOSAL_REL,
  proposalDoc,
  seedConfirmedIntent,
  write,
} from "./fixture.ts";
import {
  createCustomerInputChannel,
  type CustomerInputOutcome,
  type OperatorJudgeResultPayload,
  type OperatorRequestPayload,
} from "../../../app/desktop/customer-input.ts";
import type { CustomerInputRequest, GovernanceJudgeContext } from "../../../src/model/runtime.ts";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("等待测试条件超时");
    await wait(5);
  }
}

test("场景7a：超时解析——默认 120s；环境变量覆盖；非法值回默认；显式选项优先", () => {
  assert.equal(DEFAULT_GOVERNANCE_JUDGE_TIMEOUT_MS, 120_000);
  assert.equal(resolveGovernanceJudgeTimeoutMs(undefined, {}), 120_000, "默认 120s");
  assert.equal(resolveGovernanceJudgeTimeoutMs(undefined, { [GOVERNANCE_JUDGE_TIMEOUT_ENV]: "1234" }), 1234, "环境变量覆盖");
  assert.equal(resolveGovernanceJudgeTimeoutMs(undefined, { [GOVERNANCE_JUDGE_TIMEOUT_ENV]: " 4321 " }), 4321, "trim 后合法");
  for (const bad of ["0", "-5", "1.5", "abc", "", "1e3"]) {
    assert.equal(
      resolveGovernanceJudgeTimeoutMs(undefined, { [GOVERNANCE_JUDGE_TIMEOUT_ENV]: bad }),
      120_000,
      `非法值回默认：${JSON.stringify(bad)}`,
    );
  }
  assert.equal(
    resolveGovernanceJudgeTimeoutMs(250, { [GOVERNANCE_JUDGE_TIMEOUT_ENV]: "1234" }),
    250,
    "显式选项优先于环境变量",
  );
});

interface TimeoutHarness {
  presented: OperatorRequestPayload[];
  rows: OperatorJudgeResultPayload[];
  ask(req: CustomerInputRequest, ctx: Record<string, unknown>): Promise<CustomerInputOutcome>;
}

function makeTimeoutHarness(root: string): TimeoutHarness {
  const presented: OperatorRequestPayload[] = [];
  const rows: OperatorJudgeResultPayload[] = [];
  let seq = 0;
  const judge = createGovernanceJudge({
    project: { projectRoot: root, skillRoot: root, roles: {} },
    runtime: "claude",
    runtimeOptions: { modelId: "fixture-model" },
    createAdapter: fakeJudgeFactory({ silent: true }),
    // 不传 timeoutMs：走环境变量（用例内临时设置）。
  });
  const channel = createCustomerInputChannel({
    operatorId: "test:op",
    presenter: (payload) => presented.push(payload),
    nextId: () => `op-${++seq}`,
    judge: { fn: judge, isGroupEnabled: () => true },
    emitJudgeResult: (payload) => rows.push(payload),
  });
  return {
    presented,
    rows,
    async ask(req, ctx) {
      const pending = channel.customerInput(req, {
        roleId: "rapporteur",
        runtime: "claude",
        projectRoot: root,
        governanceModel: "trio",
        ...ctx,
      }, {
        turnId: "turn-1",
        toolCallId: "tc-timeout",
        flowId: FLOW,
        cardKind: req.cardKind,
        judgeContext: judgeContextFor(req, (ctx.judgeContext as Record<string, unknown> | undefined) ?? {}) as unknown as GovernanceJudgeContext,
      });
      await waitFor(() => presented.length > 0);
      const card = presented[presented.length - 1]!;
      const decision =
        req.kind === "confirm"
          ? ({ kind: "confirm", confirmed: false } as const)
          : ({ kind: "choice", selected: [req.options[0]!.id] } as const);
      channel.respond({ id: card.id, decision });
      return (await pending) as CustomerInputOutcome;
    },
  };
}

test("场景7b：环境变量覆盖生效——审批组（write）超时回落原卡", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-judge-timeout-approval-"));
  const previous = process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV];
  process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV] = "40";
  try {
    const h = makeTimeoutHarness(root);
    const started = Date.now();
    const outcome = await h.ask(cardFor("write"), {});
    const elapsed = Date.now() - started;
    assert.equal(h.presented.length, 1, "超时必须呈现该组原卡");
    assert.match(h.presented[0]!.judgeNotice ?? "", /判断超时/);
    assert.match(h.presented[0]!.judgeNotice ?? "", /已转你手动确认/);
    assert.equal(h.rows.length, 0, "超时不产生 judge 结果行");
    assert.equal(outcome.outcome, "declined", "客户手动拒绝（fallback 后手动作答）");
    assert.ok(elapsed >= 35, `应按环境变量的 40ms 超时，而不是默认 120s（实际 ${elapsed}ms）`);
    assert.ok(elapsed < 5000, `不得等待默认 120s（实际 ${elapsed}ms）`);
  } finally {
    if (previous === undefined) delete process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV];
    else process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV] = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("场景7c：决策组（proposal）超时同样回落该组原卡", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ans-judge-timeout-decision-"));
  const previous = process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV];
  process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV] = "40";
  try {
    write(root, PROPOSAL_REL, proposalDoc(FLOW));
    // 前置：客户已确认意图；否则决策组在证据包构建处直接 intent-missing，测不到「判断超时」。
    await seedConfirmedIntent(root);
    const h = makeTimeoutHarness(root);
    const outcome = await h.ask(cardFor("proposal"), {
      judgeContext: { artifacts: { proposalPath: PROPOSAL_REL } },
    });
    assert.equal(h.presented.length, 1, "决策组超时也呈现原卡");
    const notice = h.presented[0]!.judgeNotice ?? "";
    assert.match(notice, /判断超时/);
    assert.match(notice, /代决策/);
    assert.equal(h.rows.length, 0);
    assert.equal(outcome.outcome, "answered", "客户本人可继续作答");
    assert.equal(outcome.operatorId, "test:op", "不是 judge 代批");
  } finally {
    if (previous === undefined) delete process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV];
    else process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV] = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
