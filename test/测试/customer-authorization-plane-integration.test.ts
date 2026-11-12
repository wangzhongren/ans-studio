// test/测试/customer-authorization-plane-integration.test.ts
// D1（2026-11-03 客户授权平面，T3）：跨层集成——真实 Model（解析器/高危谓词）→
// Provider（文件账本 + 共享 jsonl-ledger）→ Service（状态机/快照）→ Pipeline（客户指令公共句柄）
// → 桌面主进程控制器（presenter 替身）→ shell 闸（takeDirective 注入）→ customer-input decision 消费者
// → Q9 归属（request.resolved / version.decision / run manifest）。
//
// 本文件只验证当前候选的实际行为；不启动 Electron、不触网、不写真实 userData。
// 测试中的 presenter/channel 是替身；Model/Provider/Service/Pipeline/shell-gate/task-state/run-manifest
// 均为真实实现。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseDirectiveMarker } from "../../src/model/directive-marker.ts";
import {
  CUSTOMER_DIRECTIVES_REL,
  type ApprovalAction,
  type CustomerDirectiveUntil,
  type DecisionAction,
  type DirectiveScope,
} from "../../src/model/directive.ts";
import type {
  CustomerInputOutcome,
  CustomerInputRequest,
  ShellReviewRequest,
} from "../../src/model/runtime.ts";
import { VERSION_DECISION_SCHEMA } from "../../src/model/project-state.ts";
import {
  createCustomerDirectiveRuntime,
  type CustomerDirectiveRuntime,
  type DirectiveConfirmationValues,
  type SubmitResult,
} from "../../src/pipeline/orchestration/customer-directive.ts";
import {
  createDirectiveInputController,
  directiveIdFromOperatorId,
  type DirectiveConfirmRequestPayload,
  type DirectiveInputController,
  type DirectiveNote,
} from "../../app/desktop/directive-input.ts";
import {
  createCustomerInputChannel,
  type DirectiveDecisionNotice,
  type OperatorJudgeResultPayload,
  type OperatorRequestPayload,
} from "../../app/desktop/customer-input.ts";
import {
  BRANCH_C_ALLOW,
  BRANCH_DIRECTIVE_ALLOW,
  BRANCH_DIRECTIVE_DENY,
  createShellGate,
  type ShellClass,
  type ShellGate,
  type ShellRules,
} from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import {
  appendTaskEvent,
  readTaskState,
  taskEvent,
} from "../../src/common/编排/task-state.ts";
import {
  collectResolvedWithoutExecution,
  mapVersionDecisionAnswer,
} from "../../src/common/编排/version-decision.ts";
import {
  applyRunChange,
  readRunManifest,
  writeRunManifest,
  type RunManifest,
} from "../../src/common/编排/run-manifest.ts";

const NOW = () => new Date("2026-11-03T00:00:00.000Z");
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

/** 有界轮询等待（v2.0.0 发布阻断 B3-1）：条件未在预算内满足即如实失败，不无限循环。 */
async function waitUntil(check: () => boolean, timeoutMs = 5000, what = "条件"): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`${what}：有界等待超时（${timeoutMs}ms）`);
    await tick(10);
  }
}

/**
 * 有界等待（v2.0.0 发布阻断 B3-1）：任何可能被「无人作答的客户卡」吊住的 await 都必须有上限。
 * 超时即抛错（测试如实失败并指出挂起点），绝不无限挂起；断言未放宽。
 */
async function bounded<T>(value: T | Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${what}：有界等待超时（${ms}ms）——疑似卡片被呈现给客户而无人作答`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// —————————————————————— 桌面主进程控制器（presenter 替身） ——————————————————————

interface DesktopHarness {
  controller: DirectiveInputController;
  presented: DirectiveConfirmRequestPayload[];
  notices: DirectiveNote[];
  runtime(): CustomerDirectiveRuntime;
}

/** 用真实 C1 控制器 + 真实 Pipeline；presenter 为替身（记录确认请求、由测试回包）。 */
function makeDesktop(root: string, sessionId: string): DesktopHarness {
  const presented: DirectiveConfirmRequestPayload[] = [];
  const notices: DirectiveNote[] = [];
  let runtime: CustomerDirectiveRuntime | undefined;
  const controller = createDirectiveInputController({
    sessionId,
    present: (payload) => presented.push(payload),
    emitNotice: (note) => notices.push(note),
    createRuntime: (options) => {
      runtime = createCustomerDirectiveRuntime(options);
      return runtime;
    },
    now: NOW,
  });
  controller.setCurrentProject(root);
  return {
    controller,
    presented,
    notices,
    runtime: () => {
      if (runtime === undefined) throw new Error("指令运行时尚未创建");
      return runtime;
    },
  };
}

interface SubmitOptions {
  target: "approval" | "decision";
  rawText: string;
  values: DirectiveConfirmationValues;
  roleId?: string;
  decisionGroupEnabled?: boolean;
}

/** 提交并回应确认面板；返回 durable 结果与落账 id。 */
async function submitAndConfirm(
  harness: DesktopHarness,
  root: string,
  options: SubmitOptions,
): Promise<{ result: SubmitResult; id: string }> {
  const before = harness.presented.length;
  const pending = harness.controller.submitFromInput({
    rawText: options.rawText,
    target: options.target,
    projectRoot: root,
    roleId: options.roleId ?? "chief",
    runtime: "demo",
    decisionGroupEnabled: options.decisionGroupEnabled ?? true,
  });
  await tick();
  assert.equal(harness.presented.length, before + 1, "presenter 应收到一个确认请求");
  const payload = harness.presented[before]!;
  assert.equal(payload.request.target, options.target);
  assert.equal(parseDirectiveMarker(payload.request.rawText)?.target, options.target);
  const reply = await harness.controller.respond({
    id: payload.request.id,
    decision: "confirm",
    values: options.values,
  });
  assert.equal(reply.ok, true, reply.error ?? "respond 失败");
  const result = await pending;
  assert.equal(result.ok, true, result.ok ? "" : `${result.error}: ${result.message ?? ""}`);
  if (!result.ok) throw new Error("unreachable");
  return { result, id: result.id };
}

function approvalAllowShell(command: string, root: string, until: CustomerDirectiveUntil): DirectiveConfirmationValues {
  return {
    action: { kind: "allow", resource: { type: "shell", command, cwd: root } },
    scope: {},
    until,
  };
}

function approvalDenyShell(command: string, root: string, until: CustomerDirectiveUntil): DirectiveConfirmationValues {
  return {
    action: { kind: "deny", resource: { type: "shell", command, cwd: root } },
    scope: {},
    until,
  };
}

function decisionValues(action: DecisionAction, until: CustomerDirectiveUntil, scope: DirectiveScope = {}): DirectiveConfirmationValues {
  return { action, scope, until };
}

// —————————————————————— shell 闸（真实 createShellGate + takeDirective 注入） ——————————————————————

const RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };

interface GateHarness {
  gate: ShellGate;
  audit: ReturnType<typeof createMemoryAuditSink>;
  operatorCalls(): number;
}

function makeGate(runtime: CustomerDirectiveRuntime, classify: () => ShellClass): GateHarness {
  const audit = createMemoryAuditSink();
  let operatorCalls = 0;
  const gate = createShellGate({
    projectRoot: "/d1-integration",
    classifyShell: () => classify(),
    rules: RULES,
    rulesId: "d1-integration",
    audit,
    operatorChannel: () => {
      operatorCalls += 1;
      return { outcome: "deny", operatorId: "operator" };
    },
    takeDirective: (req, intent) => runtime.takeDirective(req, intent),
    now: NOW,
  });
  return { gate, audit, operatorCalls: () => operatorCalls };
}

function shellReq(command: string, cwd: string, toolCallId = "call-1"): ShellReviewRequest {
  return { command, argv: command.split(/\s+/), cwd, toolCallId };
}

// —————————————————————— decision 消费者（真实 customer-input 通道） ——————————————————————

interface ChannelHarness {
  channel: ReturnType<typeof createCustomerInputChannel>;
  pushed: OperatorRequestPayload[];
  judgeResults: OperatorJudgeResultPayload[];
  results: DirectiveDecisionNotice[];
  notices: DirectiveDecisionNotice[];
}

function makeChannel(runtime: CustomerDirectiveRuntime): ChannelHarness {
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
      isGroupEnabled: () => true,
      fn: async (request) => ({
        verdict: "manual",
        group: "decision",
        cardKind: "decision",
        engine: request.runtime,
        reasonCode: "d1-integration",
      }),
    },
    emitJudgeResult: (payload) => judgeResults.push(payload),
    directive: {
      decisionFacts: () => runtime.decisionFacts(),
      applyDecisionDirective: (_root, card, hooks) => runtime.applyDecisionDirective(card, hooks),
      emitResult: (note) => results.push(note),
      emitNotice: (note) => notices.push(note),
    },
  });
  return { channel, pushed, judgeResults, results, notices };
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

const CONTEXT = {
  roleId: "chief",
  projectRoot: "/placeholder",
  runtime: "demo" as const,
  governanceModel: "trio" as const,
};

function context(root: string) {
  return { ...CONTEXT, projectRoot: root };
}

function expectAnswered(
  outcome: CustomerInputOutcome | null | undefined,
): Extract<CustomerInputOutcome, { outcome: "answered" }> {
  assert.ok(outcome !== null && outcome !== undefined, "期望有 outcome");
  assert.equal(outcome.outcome, "answered");
  if (outcome.outcome !== "answered") throw new Error("期望 answered");
  return outcome;
}

function expectDeclined(
  outcome: CustomerInputOutcome | null | undefined,
): Extract<CustomerInputOutcome, { outcome: "declined" }> {
  assert.ok(outcome !== null && outcome !== undefined, "期望有 outcome");
  assert.equal(outcome.outcome, "declined");
  if (outcome.outcome !== "declined") throw new Error("期望 declined");
  return outcome;
}

// —————————————————————— 1. 创建 → facts 快照 → target 隔离 → shell allow / decision 代选 ——————————————————————

test("创建→facts 快照：审批/决策指令分列，target 隔离；shell 闸只消费审批、decision 卡只消费决策", async () => {
  const t = tempDir("ans-d1-facts-");
  try {
    const h = makeDesktop(t.dir, "session-d1-facts");
    const approval = await submitAndConfirm(h, t.dir, {
      target: "approval",
      rawText: '@审批 允许 shell "npm install" once',
      values: approvalAllowShell("npm install", t.dir, "once"),
    });
    const decision = await submitAndConfirm(h, t.dir, {
      target: "decision",
      rawText: "@决策 选推荐项 until=session",
      values: decisionValues({ kind: "select-recommended" }, "session"),
    });

    assert.equal(approval.id, "d-1");
    assert.equal(decision.id, "d-2");
    assert.ok(
      h.notices.some((note) => note.summary === `已记录审批指令 #${approval.id}`),
      "durable 成功后投审批回执",
    );
    assert.ok(
      h.notices.some((note) => note.summary === `已记录决策指令 #${decision.id}`),
      "durable 成功后投决策回执",
    );

    const approvalFacts = h.runtime().approvalFacts();
    assert.equal(approvalFacts.ledgerErrors, 0);
    assert.equal(approvalFacts.active.length, 1);
    assert.equal(approvalFacts.active[0]!.id, approval.id);
    assert.equal(approvalFacts.active[0]!.target, "approval");
    const decisionFacts = h.runtime().decisionFacts();
    assert.equal(decisionFacts.ledgerErrors, 0);
    assert.equal(decisionFacts.active.length, 1);
    assert.equal(decisionFacts.active[0]!.id, decision.id);
    assert.equal(decisionFacts.active[0]!.target, "decision");

    // 决策指令不能被 shell 闸消费；审批指令不能被 decision 卡消费。
    const gateHarness = makeGate(h.runtime(), () => "review");
    const allowed = await gateHarness.gate(shellReq("npm install", t.dir, "call-allow"));
    assert.equal(allowed.allow, true);
    if (allowed.allow) {
      assert.equal(allowed.by, `directive:${approval.id}`);
      assert.deepEqual(allowed.directive, { id: approval.id, scope: "once" });
    }
    assert.equal(gateHarness.audit.records[0]!.branch, BRANCH_DIRECTIVE_ALLOW);
    assert.deepEqual(gateHarness.audit.records[0]!.directive, { id: approval.id, scope: "once" });
    assert.equal(gateHarness.audit.records[0]!.judge, undefined);
    assert.equal(gateHarness.audit.records[0]!.customerGrant, undefined);
    assert.equal(h.runtime().approvalFacts().active.length, 0, "once 已被 gate durable 消费");
    assert.equal(h.runtime().decisionFacts().active.length, 1, "审批消费者不触碰决策指令");

    // 同命令第二次：once 用尽 ⇒ 回落既有 operator 通道（拒绝）。
    const second = await gateHarness.gate(shellReq("npm install", t.dir, "call-allow-2"));
    assert.equal(second.allow, false);
    assert.equal(gateHarness.operatorCalls(), 1);
    assert.equal(gateHarness.audit.records[1]!.directive, undefined);

    const channelHarness = makeChannel(h.runtime());
    const outcome = expectAnswered(await bounded(channelHarness.channel.customerInput(decisionCard(), context(t.dir)), 5000, "集成 1：decision 指令代选结算"));
    assert.deepEqual(outcome.value.selected, ["alpha"]);
    assert.equal(outcome.operatorId, `directive:${decision.id}`);
    assert.deepEqual(outcome.directive, { id: decision.id, action: "select-recommended" });
    assert.equal(channelHarness.judgeResults.length, 0, "指令代选不进入默认推荐 judge");
    assert.equal(channelHarness.results.length, 1, "可见结果行先于 durable 消费");
    assert.equal(h.runtime().decisionFacts().active.length, 1, "session 指令不因消费失效");
    assert.equal(channelHarness.pushed.length, 0, "指令代选不呈现客户卡");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 2. deny 先于 c=allow、allow 仅 review/risky、撤销 ——————————————————————

test("shell 闸：deny 指令先于 c=allow；allow 在既有审批链之前；撤销后回落 c=allow", async () => {
  const t = tempDir("ans-d1-gate-");
  try {
    const h = makeDesktop(t.dir, "session-d1-gate");
    const deny = await submitAndConfirm(h, t.dir, {
      target: "approval",
      rawText: '@审批 拒绝 shell "npm install" until=session',
      values: approvalDenyShell("npm install", t.dir, "session"),
    });
    const gateHarness = makeGate(h.runtime(), () => "allow");
    const denied = await gateHarness.gate(shellReq("npm install", t.dir, "call-deny"));
    assert.equal(denied.allow, false);
    if (!denied.allow) {
      assert.equal(denied.by, `directive:${deny.id}`);
      assert.deepEqual(denied.directive, { id: deny.id, scope: "session" });
    }
    assert.equal(gateHarness.audit.records[0]!.branch, BRANCH_DIRECTIVE_DENY);
    assert.equal(gateHarness.operatorCalls(), 0, "deny 指令在 c=allow 之前终结，不打扰 operator");

    const allow = await submitAndConfirm(h, t.dir, {
      target: "approval",
      rawText: '@审批 允许 shell "npm run build" once',
      values: approvalAllowShell("npm run build", t.dir, "once"),
    });
    const reviewGate = makeGate(h.runtime(), () => "review");
    const allowed = await reviewGate.gate(shellReq("npm run build", t.dir, "call-allow"));
    assert.equal(allowed.allow, true);
    if (allowed.allow) assert.equal(allowed.by, `directive:${allow.id}`);
    assert.equal(reviewGate.audit.records[0]!.branch, BRANCH_DIRECTIVE_ALLOW);

    const revoked = await h.controller.revoke({
      id: deny.id,
      target: "approval",
      projectRoot: t.dir,
      roleId: "chief",
      runtime: "demo",
    });
    assert.equal(revoked.ok, true);
    assert.ok(
      h.notices.some((note) => note.summary === `已撤销审批指令 #${deny.id}`),
      "撤销回执",
    );
    assert.equal(h.runtime().approvalFacts().active.some((fact) => fact.id === deny.id), false);

    const cAllowGate = makeGate(h.runtime(), () => "allow");
    const cAllowed = await cAllowGate.gate(shellReq("npm install", t.dir, "call-after-revoke"));
    assert.equal(cAllowed.allow, true, "撤销后回到既有 c=allow");
    if (cAllowed.allow) assert.equal(cAllowed.directive, undefined);
    assert.equal(cAllowGate.audit.records[0]!.branch, BRANCH_C_ALLOW);
    assert.equal(cAllowGate.operatorCalls(), 0);

    const listed = await h.controller.list();
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.approval.revoked.length, 1);
      assert.equal(listed.approval.revoked[0]!.id, deny.id);
      assert.equal(listed.approval.consumed[0]!.id, allow.id);
    }
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 3. decision 拒绝 / 冲突绕过默认推荐 ——————————————————————

test("decision 消费者：拒绝指令结算 declined；冲突时绕过默认推荐、呈现客户卡且不消费", async () => {
  const t = tempDir("ans-d1-decision-");
  try {
    const h = makeDesktop(t.dir, "session-d1-decision");
    const reject = await submitAndConfirm(h, t.dir, {
      target: "decision",
      rawText: "@决策 拒绝 flow=focus until=session",
      values: decisionValues({ kind: "reject" }, "session", { flowId: "focus" }),
    });
    const channelHarness = makeChannel(h.runtime());
    const declined = expectDeclined(await bounded(channelHarness.channel.customerInput(decisionCard(), context(t.dir)), 5000, "集成 3：拒绝指令结算"));
    assert.equal(declined.operatorId, `directive:${reject.id}`);
    assert.deepEqual(declined.directive, { id: reject.id, action: "reject" });
    assert.equal(channelHarness.judgeResults.length, 0);
    assert.equal(channelHarness.results.length, 1);

    const conflictDir = tempDir("ans-d1-conflict-");
    try {
      const ch = makeDesktop(conflictDir.dir, "session-d1-conflict");
      const first = await submitAndConfirm(ch, conflictDir.dir, {
        target: "decision",
        rawText: "@决策 选推荐项 flow=focus until=session",
        values: decisionValues({ kind: "select-recommended" }, "session", { flowId: "focus" }),
      });
      const second = await submitAndConfirm(ch, conflictDir.dir, {
        target: "decision",
        rawText: "@决策 只接受 beta flow=focus until=session",
        values: decisionValues({ kind: "select-option", selector: "beta" }, "session", { flowId: "focus" }),
      });
      const conflictChannel = makeChannel(ch.runtime());
      const pending = conflictChannel.channel.customerInput(decisionCard(), context(conflictDir.dir));
      await waitUntil(() => conflictChannel.pushed.length === 1, 5000, "集成 3：冲突客户卡呈现");
      assert.equal(conflictChannel.pushed.length, 1, "冲突时呈现客户卡");
      assert.equal(conflictChannel.results.length, 0, "不产生指令生效行");
      assert.equal(conflictChannel.judgeResults.length, 0, "绕过默认推荐 judge");
      assert.equal(conflictChannel.notices.length, 1);
      assert.match(conflictChannel.notices[0]!.summary, /决策指令冲突/);
      assert.equal(ch.runtime().decisionFacts().active.length, 2, "冲突不消费任何一条");
      assert.ok([first.id, second.id].every((id) => ch.runtime().decisionFacts().active.some((fact) => fact.id === id)));

      const pushed = conflictChannel.pushed[0]!;
      assert.equal(
        conflictChannel.channel.respond({ id: pushed.id, decision: { kind: "choice", selected: ["beta"] } }).ok,
        true,
      );
      const answered = expectAnswered(await bounded(pending, 5000, "集成 3：冲突后客户手选结算"));
      assert.deepEqual(answered.value.selected, ["beta"]);
    } finally {
      conflictDir.cleanup();
    }
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 4. session 重启失效 / once 未使用失效 ——————————————————————

test("session 重启：新运行 sessionId 下 session 指令 app-restart 失效、未用 once 指令 unused-once 失效", async () => {
  const t = tempDir("ans-d1-restart-");
  try {
    const first = makeDesktop(t.dir, "session-run-A");
    const once = await submitAndConfirm(first, t.dir, {
      target: "approval",
      rawText: '@审批 允许 shell "git status" once',
      values: approvalAllowShell("git status", t.dir, "once"),
    });
    const session = await submitAndConfirm(first, t.dir, {
      target: "decision",
      rawText: "@决策 选推荐项 until=session",
      values: decisionValues({ kind: "select-recommended" }, "session"),
    });

    const restarted = makeDesktop(t.dir, "session-run-B");
    const listed = await restarted.controller.list();
    assert.equal(listed.ok, true);
    if (!listed.ok) throw new Error("unreachable");

    assert.equal(restarted.runtime().approvalFacts().active.length, 0);
    assert.equal(restarted.runtime().decisionFacts().active.length, 0);
    assert.equal(listed.approval.expired.length, 1);
    assert.equal(listed.approval.expired[0]!.id, once.id);
    assert.equal(listed.approval.expired[0]!.expiredReason, "unused-once");
    assert.equal(listed.decision.expired.length, 1);
    assert.equal(listed.decision.expired[0]!.id, session.id);
    assert.equal(listed.decision.expired[0]!.expiredReason, "app-restart");

    const gateHarness = makeGate(restarted.runtime(), () => "review");
    const shell = await gateHarness.gate(shellReq("git status", t.dir, "call-restart"));
    assert.equal(shell.allow, false, "重启后过期 once 不再放行");
    assert.equal(gateHarness.audit.records[0]!.directive, undefined);
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 5. 坏账本 fail-safe ——————————————————————

test("坏账本：approval/decision facts 为空且 ledgerErrors>0；shell 闸回落既有链、decision 卡按无指令交客户（v2.0.0 无默认推荐代选）", async () => {
  const t = tempDir("ans-d1-bad-ledger-");
  try {
    const ledger = path.join(t.dir, ...CUSTOMER_DIRECTIVES_REL.split("/"));
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, "{not-json\n", "utf8");

    const h = makeDesktop(t.dir, "session-d1-bad");
    const listed = await h.controller.list();
    assert.equal(listed.ok, true);
    if (!listed.ok) throw new Error("unreachable");
    assert.ok(listed.ledgerErrors > 0);
    assert.equal(h.runtime().approvalFacts().active.length, 0);
    assert.equal(h.runtime().decisionFacts().active.length, 0);
    assert.ok(h.runtime().approvalFacts().ledgerErrors > 0);
    assert.ok(h.runtime().decisionFacts().ledgerErrors > 0);

    const gateHarness = makeGate(h.runtime(), () => "review");
    const shell = await gateHarness.gate(shellReq("npm install", t.dir, "call-bad-ledger"));
    assert.equal(shell.allow, false, "坏账本按无指令，回落 operator 拒绝");
    assert.equal(gateHarness.operatorCalls(), 1);
    assert.equal(gateHarness.audit.records[0]!.directive, undefined);

    // v2.0.0（`e71501c`）起 decision 卡没有「默认推荐 judge」代选（`tryAutoSelectDecision` 已删除）；
    // 坏账本按无指令回落幕僚分支/客户卡。本夹具未开委托 ⇒ 原卡呈现客户本人，由客户 responder 结算。
    const channelHarness = makeChannel(h.runtime());
    const pending = channelHarness.channel.customerInput(decisionCard(), context(t.dir));
    await waitUntil(() => channelHarness.pushed.length === 1, 5000, "集成 5：坏账本客户卡呈现");
    assert.equal(channelHarness.results.length, 0, "坏账本不产生指令生效行");
    assert.equal(channelHarness.judgeResults.length, 0, "decision 卡不进入 judge（v2.0.0 无默认推荐代选）");
    assert.equal(
      channelHarness.channel.respond({ id: channelHarness.pushed[0]!.id, decision: { kind: "choice", selected: ["alpha"] } }).ok,
      true,
    );
    const outcome = expectAnswered(await bounded(pending, 5000, "集成 5：坏账本客户手选结算"));
    assert.equal(outcome.operatorId, "tester", "无指令生效：客户本人结算（不是 directive:/judge:）");
    assert.equal(outcome.directive, undefined, "坏账本按无指令，不应用任何指令");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 6. Q9 归属：request.resolved / version.decision / run manifest ——————————————————————

test("Q9 归属：decision 消费者产出 directive:<id>；task-state 与 run manifest 接受 directive + directiveId", async () => {
  const t = tempDir("ans-d1-q9-");
  try {
    const h = makeDesktop(t.dir, "session-d1-q9");
    const decision = await submitAndConfirm(h, t.dir, {
      target: "decision",
      rawText: "@决策 选推荐项 until=once",
      values: decisionValues({ kind: "select-recommended" }, "once"),
    });
    const channelHarness = makeChannel(h.runtime());
    const outcome = expectAnswered(await bounded(channelHarness.channel.customerInput(decisionCard(), context(t.dir)), 5000, "集成 6：decision 指令代选结算"));
    assert.equal(outcome.operatorId, `directive:${decision.id}`);
    assert.equal(directiveIdFromOperatorId(outcome.operatorId), decision.id);
    assert.equal(directiveIdFromOperatorId("judge:demo"), undefined);
    assert.equal(directiveIdFromOperatorId("directive:d-01"), undefined);

    // request.resolved（真实 task-state 写入 + 回放校验）。
    const resolved = taskEvent(
      "request.resolved",
      {
        requestId: "version-decision-d1",
        decisionId: "decision-d1",
        by: "directive",
        directiveId: decision.id,
        operatorId: outcome.operatorId,
        cardKind: "decision",
        selectedOptionIds: ["version-modify"],
        choice: "answered",
      },
      NOW,
    );
    const appendResolved = await appendTaskEvent(t.dir, resolved);
    assert.equal(appendResolved.ok, true, appendResolved.ok ? "" : appendResolved.message);

    const versionPlan = mapVersionDecisionAnswer({
      outcome: "answered",
      by: "directive",
      selected: ["version-modify"],
    });
    assert.equal(versionPlan.kind, "execute");
    if (versionPlan.kind === "execute") assert.equal(versionPlan.decidedBy, "directive");

    const afterResolved = await readTaskState(t.dir);
    const storedResolved = afterResolved.events.find((event) => event.kind === "request.resolved");
    assert.equal(storedResolved?.kind, "request.resolved");
    if (storedResolved?.kind === "request.resolved") {
      assert.equal(storedResolved.by, "directive");
      assert.equal(storedResolved.directiveId, decision.id);
      assert.equal(storedResolved.operatorId, `directive:${decision.id}`);
    }
    const unexecuted = collectResolvedWithoutExecution(afterResolved.events);
    assert.equal(unexecuted.length, 1, "Q9 reader 识别 directive 归属的未执行 resolved");
    assert.equal(unexecuted[0]!.decidedBy, "directive");
    assert.equal(unexecuted[0]!.requestId, "version-decision-d1");

    // version.decision（三值枚举 + directiveId 校验）。
    const versionEvent = taskEvent(
      "version.decision",
      {
        schema: VERSION_DECISION_SCHEMA,
        decisionId: "decision-d1",
        requestId: "version-decision-d1",
        attempt: 1,
        flowId: "focus",
        action: "version-modify",
        recommendedBy: "chief",
        recommendedAction: "version-modify",
        decidedBy: "directive",
        directiveId: decision.id,
        operatorId: `directive:${decision.id}`,
        reason: "客户指令代选",
        status: "executed",
      },
      NOW,
    );
    const appendVersion = await appendTaskEvent(t.dir, versionEvent);
    assert.equal(appendVersion.ok, true, appendVersion.ok ? "" : appendVersion.message);
    const afterVersion = await readTaskState(t.dir);
    const storedVersion = afterVersion.events.find((event) => event.kind === "version.decision");
    assert.equal(storedVersion?.kind, "version.decision");
    if (storedVersion?.kind === "version.decision") {
      assert.equal(storedVersion.decidedBy, "directive");
      assert.equal(storedVersion.directiveId, decision.id);
      assert.equal(storedVersion.operatorId, `directive:${decision.id}`);
    }
    assert.equal(
      collectResolvedWithoutExecution(afterVersion.events).length,
      0,
      "已有 version.decision 审计后不再列为未执行",
    );

    // run manifest（真实 applyRunChange/readRunManifest）。
    const manifest: RunManifest = {
      schema: "ans-run/v1",
      runId: "run-20261103-focus-d1d1d1d1",
      flowId: "focus",
      state: "pinned",
      createdAt: "2026-11-03T00:00:00.000Z",
      updatedAt: "2026-11-03T00:00:00.000Z",
      pinnedAt: "2026-11-03T00:00:00.000Z",
      pinnedBy: "app",
      schemas: {
        run: "ans-run/v1",
        intent: "project-intent/v1",
        proposal: "project-proposal/v2",
        modules: "project-modules/v2",
        roster: "project-roster/v3",
        topology: "project-topology/v2",
        architecture: "project-architecture/v1",
        teamPlan: "teamPlanSchema:3",
        assets: "project-assets/v1",
        evidence: "evidence-meta/v1",
      },
      documents: {
        intent: { path: "docs/product/focus-intent-v1.md", sha256: "a".repeat(64) },
        proposal: { path: "docs/proposals/focus-proposal-v1.md", sha256: "b".repeat(64) },
        modules: { path: "docs/proposals/focus-modules-v1.md", sha256: "c".repeat(64) },
        roster: { path: "docs/proposals/focus-roster-v1.md", sha256: "d".repeat(64) },
        topology: { path: "docs/proposals/focus-roster-v1.md#人员+模块拓扑图", source: "roster-block", sha256: "d".repeat(64) },
        architecture: { path: "docs/contracts/focus-architecture-v1.md", sha256: "e".repeat(64) },
        assets: null,
      },
      rosterVersion: 1,
      d3: { decisionId: "decision-x", targetRoleIds: ["dev"] },
      stage: { current: "stage-1", planVersion: 1 },
      roles: ["dev"],
      execution: { teamPlan: null, flow: null },
    };
    const written = await writeRunManifest(t.dir, manifest);
    assert.equal(written.ok, true, written.ok ? "" : `${written.code}: ${written.reason}`);
    const applied = await applyRunChange(t.dir, manifest, {
      decisionId: "decision-d1",
      mode: "continue-frozen",
      decidedBy: "directive",
      directiveId: decision.id,
      decidedAt: "2026-11-03T00:00:00.000Z",
    });
    assert.equal(applied.ok, true, applied.ok ? "" : applied.reason);
    const stored = await readRunManifest(t.dir, manifest.runId);
    assert.equal(stored.ok, true);
    if (stored.ok) {
      assert.equal(stored.manifest.runChange?.decidedBy, "directive");
      assert.equal(stored.manifest.runChange?.directiveId, decision.id);
    }
    const missingId = await applyRunChange(t.dir, manifest, {
      decisionId: "decision-d2",
      mode: "continue-frozen",
      decidedBy: "directive",
    });
    assert.equal(missingId.ok, false);
    if (!missingId.ok) assert.match(missingId.reason, /directiveId/);
  } finally {
    t.cleanup();
  }
});
