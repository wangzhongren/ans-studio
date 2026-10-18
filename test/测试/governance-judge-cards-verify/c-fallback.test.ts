// test/测试/governance-judge-cards-verify/c-fallback.test.ts
// 独立验收（测试角色，2026-10-18）：回落矩阵——按组、按卡、整卡；失败一律原卡 + judgeNotice，
// 不伪造 approve，另一组不受影响。
//
// 依据：PM 评审 §四（状态机/回落粒度）、§6.3、§十三 AC6/AC9/AC11/AC13/AC14/AC15/AC17/AC20/AC21。
// 全部离线：真实桌面客户交互通道 + 真开关状态机 + 假判断函数/假 driver。

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  CustomerInputRequest,
  GovernanceCardKind,
  GovernanceJudgeGroup,
  GovernanceJudgeOutcome,
  RuntimeKind,
} from "../../../src/model/runtime.ts";
import {
  makeChannel,
  makeJudge,
  makeRoot,
  requestFor,
  seedProject,
  tick,
  waitFor,
  FLOW,
  PROPOSAL_REL,
} from "./fixture.ts";

const proposalCard = (): CustomerInputRequest => ({
  kind: "choice",
  title: "提案 flow-a",
  cardKind: "proposal",
  flowId: FLOW,
  options: [
    { id: "accept", label: "接受" },
    { id: "reject", label: "拒绝" },
  ],
});

const writeCard = (): CustomerInputRequest => ({
  kind: "confirm",
  title: "写盘确认 flow-a",
  cardKind: "write",
  flowId: FLOW,
  preview: `将写入 ${PROPOSAL_REL}`,
});

const manual = (
  request: { group: GovernanceJudgeGroup; cardKind: GovernanceCardKind; runtime: RuntimeKind },
  reasonCode: string,
): GovernanceJudgeOutcome => ({
  verdict: "manual",
  group: request.group,
  cardKind: request.cardKind,
  engine: request.runtime,
  reasonCode,
});

function noticeOf(entry: { judgeNotice?: string }): string {
  assert.equal(typeof entry.judgeNotice, "string", "回落卡必须带 judgeNotice");
  return entry.judgeNotice!;
}

test("证据不足/读取失败/超时/引擎不可用/解析失败：原卡 + 提示，不 produce 结果行", async () => {
  const { root, cleanup } = makeRoot("fallback-reasons");
  try {
    seedProject(root);
    for (const reasonCode of ["insufficient-evidence", "read-denied", "timeout", "unsupported-engine", "parse-failed"]) {
      const h = makeChannel({
        root,
        decision: true,
        fn: async (request) => manual(request, reasonCode),
      });
      const pending = h.ask(proposalCard());
      await tick(10);
      assert.equal(h.presented.length, 1, `${reasonCode}：必须回落原卡`);
      assert.equal(h.rows.length, 0, `${reasonCode}：manual 不得产生结果行`);
      const notice = noticeOf(h.presented[0]!);
      assert.match(notice, /判断 agent 未代批（代决策）/);
      assert.match(notice, /已转你手动确认/);
      h.answer(h.presented[0]!.id, { kind: "choice", selected: ["accept"] });
      const out = await pending;
      assert.equal(out.outcome, "answered");
      assert.equal(out.judge, undefined, "客户手答不得伪造 judge 审计");
    }
  } finally {
    cleanup();
  }
});

test("无 cardKind 的旧卡：即使开关开也不判断、无 judgeNotice（旧路径零变化）", async () => {
  const { root, cleanup } = makeRoot("no-cardkind");
  try {
    seedProject(root);
    const h = makeChannel({ root, approval: true, decision: true });
    const legacy: CustomerInputRequest = { kind: "confirm", title: "旧确认卡" };
    const pending = h.ask(legacy);
    await Promise.resolve();
    assert.equal(h.presented.length, 1);
    assert.equal(h.presented[0]!.judgeNotice, undefined);
    assert.equal(h.requests.length, 0, "无 cardKind 不得调用判断");
    h.answer(h.presented[0]!.id, { kind: "confirm", confirmed: true });
    const out = await pending;
    assert.equal(out.outcome, "answered");
    assert.equal(out.judge, undefined);
  } finally {
    cleanup();
  }
});

test("single/su：decision 不启用、写盘族不代批；原卡且无判断、无提示", async () => {
  const { root, cleanup } = makeRoot("single-su");
  try {
    seedProject(root);
    for (const [roleId, governanceModel] of [["su", "single"], ["rapporteur", "single"]] as const) {
      const h = makeChannel({ root, approval: true, decision: true });
      const pending = h.ask(proposalCard(), { roleId, governanceModel });
      await Promise.resolve();
      assert.equal(h.presented.length, 1, `${roleId}/single：提案卡必须逐张呈现`);
      assert.equal(h.presented[0]!.judgeNotice, undefined);
      h.answer(h.presented[0]!.id, { kind: "choice", selected: ["accept"] });
      const out = await pending;
      assert.equal(out.outcome, "answered");

      const writePending = h.ask(writeCard(), { roleId, governanceModel });
      await Promise.resolve();
      assert.equal(h.presented.length, 2, `${roleId}/single：写盘卡必须逐张呈现`);
      assert.equal(h.presented[1]!.judgeNotice, undefined);
      h.answer(h.presented[1]!.id, { kind: "confirm", confirmed: true });
      await writePending;

      assert.equal(h.requests.length, 0, `${roleId}/single：判断 agent 0 次调用`);
      assert.equal(h.rows.length, 0);
    }
  } finally {
    cleanup();
  }
});

test("按组回落：decision 证据不足只回落 decision；approval 仍代批（反向同理）", async () => {
  const { root, cleanup } = makeRoot("group-isolation");
  try {
    seedProject(root);
    const h = makeChannel({
      root,
      approval: true,
      decision: true,
      fn: async (request): Promise<GovernanceJudgeOutcome> => {
        if (request.group === "decision") return manual(request, "insufficient-evidence");
        return {
          verdict: "approve", group: request.group, cardKind: request.cardKind, engine: request.runtime,
          reasonCode: "sufficient", reason: "写盘路径可核对", evidence: ["fixture"],
          value: { confirmed: true }, paths: request.paths,
          pathDecisions: (request.paths ?? []).map((path) => ({ path, ok: true })),
        };
      },
    });
    const decisionPending = h.ask(proposalCard());
    await tick(10);
    assert.equal(h.presented.length, 1, "decision 回落原卡");
    assert.match(noticeOf(h.presented[0]!), /代决策/);
    h.answer(h.presented[0]!.id, { kind: "choice", selected: ["accept"] });
    await decisionPending;

    const writeOut = await h.ask(writeCard());
    assert.equal(writeOut.outcome, "answered", "另一组不受影响：写盘仍代批");
    assert.equal(writeOut.outcome === "answered" ? writeOut.judge?.group : undefined, "approval");
    assert.equal(h.presented.length, 1);
    assert.equal(h.rows.length, 1);

    // 反向：approval 回落，decision 代批。
    const h2 = makeChannel({
      root,
      approval: true,
      decision: true,
      fn: async (request): Promise<GovernanceJudgeOutcome> => {
        if (request.group === "approval") return manual(request, "path-unverified");
        return {
          verdict: "approve", group: request.group, cardKind: request.cardKind, engine: request.runtime,
          reasonCode: "sufficient", reason: "提案可接受", evidence: ["fixture"],
          value: { selected: ["accept"] },
        };
      },
    });
    const writePending = h2.ask(writeCard());
    await tick(10);
    assert.equal(h2.presented.length, 1);
    assert.match(noticeOf(h2.presented[0]!), /代审批/);
    h2.answer(h2.presented[0]!.id, { kind: "confirm", confirmed: false });
    await writePending;
    const proposalOut = await h2.ask(proposalCard());
    assert.equal(proposalOut.outcome === "answered" ? proposalOut.judge?.group : undefined, "decision");
    assert.equal(h2.rows.length, 1);
  } finally {
    cleanup();
  }
});

test("通道层超时：判断挂起超过通道超时 ⇒ 原卡 + 超时提示", async () => {
  const { root, cleanup } = makeRoot("channel-timeout");
  try {
    seedProject(root);
    const h = makeChannel({ root, decision: true, timeoutMs: 30, fn: () => new Promise(() => {}) });
    const pending = h.ask(proposalCard());
    await tick(60);
    assert.equal(h.presented.length, 1);
    assert.match(noticeOf(h.presented[0]!), /判断超时/);
    h.answer(h.presented[0]!.id, { kind: "choice", selected: ["reject"] });
    const out = await pending;
    assert.equal(out.outcome, "answered");
  } finally {
    cleanup();
  }
});

test("结果行投达失败：approve 降级手动（row-failed 单列），不自动结算", async () => {
  const { root, cleanup } = makeRoot("row-failed");
  try {
    seedProject(root);
    const h = makeChannel({
      root,
      decision: true,
      emitJudgeResult: () => { throw new Error("窗口已关闭"); },
    });
    const pending = h.ask(proposalCard());
    await tick(10);
    assert.equal(h.presented.length, 1, "结果行失败必须呈现原卡");
    const notice = noticeOf(h.presented[0]!);
    assert.match(notice, /判断已完成，但结果无法在聊天中显示/);
    assert.doesNotMatch(notice, /未代批/, "不得把已完成判断说成未发生");
    h.answer(h.presented[0]!.id, { kind: "choice", selected: ["accept"] });
    const out = await pending;
    assert.equal(out.outcome, "answered");
    assert.equal(out.judge, undefined, "结果行失败不得按代批结算");
  } finally {
    cleanup();
  }
});

test("判断期间关闭开关：approve 迟到也回落 switch-off，不结算、不写结果行", async () => {
  const { root, cleanup } = makeRoot("switch-off");
  try {
    seedProject(root);
    let release: (() => void) | undefined;
    const h = makeChannel({
      root,
      decision: true,
      fn: (request) => new Promise((resolve) => {
        release = () => resolve({
          verdict: "approve", group: request.group, cardKind: request.cardKind, engine: request.runtime,
          reasonCode: "sufficient", reason: "可以接受", evidence: ["fixture"],
          value: { selected: ["accept"] },
        });
      }),
    });
    const pending = h.ask(proposalCard());
    await waitFor(() => h.channel.judgingCount() === 1);
    h.decisionSwitch.set({ enabled: false });
    release!();
    await tick(10);
    assert.equal(h.presented.length, 1);
    assert.match(noticeOf(h.presented[0]!), /你已关闭对应开关/);
    assert.equal(h.rows.length, 0);
    h.answer(h.presented[0]!.id, { kind: "choice", selected: ["accept"] });
    await pending;
  } finally {
    cleanup();
  }
});

test("判断中止/关窗：judging 卡结算为 unavailable/declined；迟到结果被丢弃", async () => {
  const { root, cleanup } = makeRoot("abort-judging");
  try {
    seedProject(root);
    let release: (() => void) | undefined;
    const h = makeChannel({
      root,
      approval: true,
      fn: (request) => new Promise((resolve) => {
        release = () => resolve({
          verdict: "approve", group: request.group, cardKind: request.cardKind, engine: request.runtime,
          reasonCode: "sufficient", reason: "可以写", evidence: ["fixture"],
          value: { confirmed: true }, paths: request.paths,
          pathDecisions: (request.paths ?? []).map((path) => ({ path, ok: true })),
        });
      }),
    });
    const controller = new AbortController();
    const pending = h.ask(writeCard(), { sessionSignal: controller.signal });
    await waitFor(() => h.channel.judgingCount() === 1);
    controller.abort();
    const out = await pending;
    assert.equal(out.outcome, "unavailable", "中止 = 未获同意（fail-closed）");
    release!();
    await tick(10);
    assert.equal(h.rows.length, 0, "迟到 approve 不得写结果行");
    assert.equal(h.presented.length, 0, "迟到结果不得呈现");
    assert.equal(h.channel.judgingCount(), 0);

    // 关窗路径：judging 一并 declined。
    let release2: (() => void) | undefined;
    const h2 = makeChannel({
      root,
      approval: true,
      fn: () => new Promise((resolve) => { release2 = () => resolve(manual({ group: "approval", cardKind: "write", runtime: "claude" }, "timeout")); }),
    });
    const pending2 = h2.ask(writeCard());
    await waitFor(() => h2.channel.judgingCount() === 1);
    h2.channel.rejectAllPending("窗口已关闭，未获同意（fail-closed）");
    const out2 = await pending2;
    assert.equal(out2.outcome, "declined");
    release2!();
    await tick(10);
    assert.equal(h2.presented.length, 0, "judging 中关窗不得再呈现原卡");
    assert.equal(h2.channel.judgingCount(), 0);
  } finally {
    cleanup();
  }
});

test("同一会话 driver 一次只判一张：第二次并发直接 manual/unavailable（不排队）", async () => {
  const { root, cleanup } = makeRoot("driver-busy");
  try {
    seedProject(root);
    const { judge } = makeJudge(root, { silent: true }, { timeoutMs: 120 });
    const first = judge(requestFor("proposal"));
    await tick(10);
    const second = await judge(requestFor("proposal"));
    assert.equal(second.verdict, "manual");
    assert.equal(second.reasonCode, "unavailable");
    const firstOutcome = await first;
    assert.equal(firstOutcome.verdict, "manual");
    assert.equal(firstOutcome.reasonCode, "timeout");
  } finally {
    cleanup();
  }
});
