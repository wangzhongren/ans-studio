// test/编排/shell-escalation.test.ts
// 2026-10-31 shell 判拒后的客户确认通道（方案 v1.3 §4/§6.3/§7.1/§9/§13.2）——编排 registry 单测。
//
// 覆盖（B1 可观察交付）：
//   · 资格矩阵（可申请/不可申请全表：judge deny / retry-capped / c=deny 各路径 / preblock /
//     write-guard / script:context-unavailable / failClosed / readonly / 非 judge 拒绝 / 其它 manual /
//     row-failed / 后台入口）；
//   · 旧记录清理（后续 allow / 客户手拒 / 其它 manual 删除 recorded；后台 review 不写入/不清除）；
//   · 状态机（recorded→requested→granted-once/session/denied/expired→consumed）与回执；
//   · 限流（同命令每会话一次、会话总上限 5、同时 1 张待答；超限/待答不弹卡）；
//   · 一次性/会话授权、键精确性（argv/cwd/角色/项目/entry）、会话重建失效；
//   · 脚本上下文 sha256 时效（stale ⇒ 授权作废、终态、不可再申请）；
//   · 审计（`event:"escalation-decision"` 必填字段/稳定 branch/by；失败不翻转）；
//   · 回滚开关（`ANS_SHELL_ESCALATION_DISABLED=1`：不创建 registry / 工具能力不注入 / takeGrant 不注入）；
//   · 与闸/`openRoleSession` 的接线（同一审计 sink；judge 判拒 → 申请 → 原样重试 → 授权放行）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  ShellApprovalContext,
  ShellEscalationCardRequest,
  ShellEscalationDecision,
  ShellEscalationPresentFn,
  ShellJudgeAudit,
  ShellReviewRequest,
} from "../../src/model/runtime.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { ShellAuditRecord } from "../../src/common/编排/shell-audit.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import {
  BRANCH_ESCALATION_DENIED,
  BRANCH_ESCALATION_EXPIRED,
  BRANCH_ESCALATION_GRANTED_ONCE,
  BRANCH_ESCALATION_GRANTED_SESSION,
  SHELL_ESCALATION_DISABLED_ENV,
  createShellEscalationSession,
  digestApprovalContext,
  escalationEligibility,
  shellEscalationDisabled,
  type ShellEscalationReviewedOutcome,
  type ShellEscalationSession,
  type ShellEscalationSessionConfig,
} from "../../src/common/编排/shell-escalation.ts";
import {
  BRANCH_CUSTOMER_ESCALATION_ALLOW_ONCE,
  buildShellGate,
  createShellGate,
  type ShellGateReviewedOutcome,
} from "../../src/common/编排/shell-gate.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { RuntimeAdapter } from "../../src/model/runtime.ts";

const ROLE = "worker";
const ROOT = "/proj";
const NOW = new Date("2026-10-31T12:00:00.000Z");

// —————————————————————— 夹具 ——————————————————————

const judgeDeny = (over: Partial<ShellJudgeAudit> = {}): ShellJudgeAudit => ({
  engine: "pi",
  verdict: "deny",
  reasonCode: "model-deny",
  reason: "该命令可能破坏工作区",
  customerMessage: "自动代理未放行该命令。关闭「替我审批」后重试。",
  alternative: { kind: "command", value: "npm run build:check" },
  ...over,
});

const judgeRetryCapped = (): ShellJudgeAudit =>
  judgeDeny({ modelVerdict: "manual", reasonCode: "retry-capped", manualAsDeny: true });

const reqOf = (argv: string[], over: Partial<ShellReviewRequest> = {}): ShellReviewRequest => ({
  command: argv.join(" "),
  argv,
  cwd: ROOT,
  toolCallId: "tc-1",
  entry: "run_shell",
  ...over,
});

const deniedOutcome = (
  judge: ShellJudgeAudit | undefined,
  over: { branch?: string } = {},
): ShellEscalationReviewedOutcome => ({
  result: { allow: false as const, reason: "拒绝", by: "operator:judge" },
  conclusion: "deny" as const,
  branch: over.branch ?? "c-review→a-deny",
  ...(judge !== undefined ? { judge } : {}),
});

const allowOutcome = (over: Partial<ShellEscalationReviewedOutcome> = {}): ShellEscalationReviewedOutcome => ({
  result: { allow: true as const, by: "ruleset:test" },
  conclusion: "allow" as const,
  branch: "c-allow",
  ...over,
});

interface Harness {
  session: ShellEscalationSession;
  calls: ShellEscalationCardRequest[];
  setDecision: (decision: ShellEscalationDecision | (() => Promise<ShellEscalationDecision>)) => void;
  audit: ReturnType<typeof createMemoryAuditSink>;
}

function makeSession(over: Partial<ShellEscalationSessionConfig> = {}): Harness {
  const calls: ShellEscalationCardRequest[] = [];
  let next: ShellEscalationDecision | (() => Promise<ShellEscalationDecision>) = {
    action: "allow-once",
    operatorId: "cust-1",
  };
  const present: ShellEscalationPresentFn = async (card) => {
    calls.push(card);
    return typeof next === "function" ? next() : next;
  };
  const audit = createMemoryAuditSink();
  const session = createShellEscalationSession({
    roleId: ROLE,
    projectRoot: ROOT,
    runtime: "pi",
    present,
    now: () => NOW,
    idFactory: () => `req-${calls.length + 1}`,
    presentTimeoutMs: 1000,
    ...over,
  });
  session.bindAudit(audit);
  return { session, calls, setDecision: (decision) => { next = decision; }, audit };
}

/** 记录一条 judge 判拒（默认 branch c-review→a-deny）。 */
function recordJudgeDeny(harness: Harness, argv: string[], over: { judge?: ShellJudgeAudit; req?: Partial<ShellReviewRequest>; branch?: string } = {}) {
  const req = reqOf(argv, over.req ?? {});
  harness.session.recordReview(req, deniedOutcome(over.judge ?? judgeDeny(), over.branch !== undefined ? { branch: over.branch } : {}));
  return req;
}

const request = (harness: Harness, argv: string[], necessity?: string, signal?: AbortSignal) =>
  harness.session.request({ command: argv.join(" "), argv, ...(necessity !== undefined ? { necessity } : {}) }, signal);

// —————————————————————— A. 资格矩阵：可申请 ——————————————————————

test("可申请：judge 主动 deny（review 档）→ 记录 → 申请 → 三选一卡（字段取自判拒记录）", async () => {
  const h = makeSession();
  const req = recordJudgeDeny(h, ["npm", "install", "lodash"]);
  h.setDecision({ action: "allow-once", operatorId: "cust-1" });
  const receipt = await request(h, ["npm", "install", "lodash"], "推进任务需要该依赖");
  assert.equal(receipt.ok, true);
  assert.equal(receipt.state, "granted-once");
  assert.match(receipt.message, /仅此一次/);
  assert.match(receipt.message, /原样重试/);
  assert.equal(h.calls.length, 1);
  const card = h.calls[0]!;
  assert.equal(card.version, 1);
  assert.equal(card.requestId, "req-1");
  assert.equal(card.roleId, ROLE);
  assert.equal(card.projectRoot, ROOT);
  assert.equal(card.runtime, "pi");
  assert.equal(card.command, req.command, "卡上命令取自判拒原文");
  assert.deepEqual(card.argv, ["npm", "install", "lodash"]);
  assert.equal(card.cwd, ROOT);
  assert.equal(card.judgeReason, judgeDeny().reason);
  assert.equal(card.judgeCustomerMessage, judgeDeny().customerMessage);
  assert.deepEqual(card.judgeAlternative, judgeDeny().alternative);
  assert.equal(card.necessity, "推进任务需要该依赖");
  assert.equal(card.expiresAt, new Date(NOW.getTime() + 1000).toISOString());
});

test("可申请：manual + retry-capped（manualAsDeny===true）→ 记录并出卡", async () => {
  const h = makeSession();
  recordJudgeDeny(h, ["mysterytool", "--flag"], { judge: judgeRetryCapped(), branch: "b-unsure→a-deny" });
  h.setDecision({ action: "deny", operatorId: "cust-2" });
  const receipt = await request(h, ["mysterytool", "--flag"]);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.state, "denied");
  assert.equal(h.calls.length, 1);
});

test("可申请：script 分支（带 approvalContext）→ 记录保存上下文并展示在卡上", async () => {
  const h = makeSession();
  const context: ShellApprovalContext = {
    scripts: [{ label: "node 脚本", content: "console.log(1)", bytes: 14, sha256: "a".repeat(64) }],
    scriptPaths: ["scripts/x.mjs"],
    note: "脚本内容已随上下文提供（有界）。",
  };
  recordJudgeDeny(h, ["node", "scripts/x.mjs"], {
    req: { approvalContext: context, entry: "run_shell" },
    branch: "script:review→a-deny",
  });
  h.setDecision({ action: "allow-once" });
  const receipt = await request(h, ["node", "scripts/x.mjs"]);
  assert.equal(receipt.ok, true);
  assert.deepEqual(h.calls[0]!.approvalContext, context);
});

// —————————————————————— B. 资格矩阵：不可申请（全表） ——————————————————————

const INELIGIBLE_CASES: Array<{
  name: string;
  argv: string[];
  outcome: ShellEscalationReviewedOutcome;
  req?: Partial<ShellReviewRequest>;
}> = [
  {
    name: "c=deny 硬拒（script 路径，judge 也在 deny 档）",
    argv: ["sh", "-c", "evil"],
    outcome: deniedOutcome(judgeDeny(), { branch: "c-deny" }),
  },
  {
    name: "c-deny→a-deny（advisory 非 script 的 c=deny 分支）",
    argv: ["evil-tool"],
    outcome: deniedOutcome(judgeDeny(), { branch: "c-deny→a-deny" }),
  },
  {
    name: "审批档 tier=deny 的 judge 判拒",
    argv: ["evil-tool"],
    outcome: deniedOutcome(judgeDeny({ tier: "deny" }), { branch: "c-deny→a-deny" }),
  },
  {
    name: "确定性前置封堵 preblock:inline-too-large",
    argv: ["node", "-e", "long"],
    outcome: deniedOutcome(undefined, { branch: "preblock:inline-too-large" }),
  },
  {
    name: "确定性前置封堵 preblock:unbounded-search",
    argv: ["grep", "-r", "x", "/"],
    outcome: deniedOutcome(undefined, { branch: "preblock:unbounded-search" }),
  },
  {
    name: "写目标守卫 deny",
    argv: ["mkfile", "outside"],
    outcome: deniedOutcome(undefined, { branch: "write-guard:deny" }),
  },
  {
    name: "script:context-unavailable",
    argv: ["node", "scripts/missing.mjs"],
    outcome: deniedOutcome(undefined, { branch: "script:context-unavailable" }),
  },
  {
    name: "脚本上下文 failClosed",
    argv: ["make", "all"],
    outcome: deniedOutcome(judgeDeny(), { branch: "script:review→a-deny" }),
    req: { approvalContext: { failClosed: true, failClosedReason: "无脚本可读" } },
  },
  {
    name: "只读档 readonly-deny",
    argv: ["rm", "tmp.txt"],
    outcome: deniedOutcome(undefined, { branch: "readonly-deny" }),
  },
  {
    name: "只读档 script:readonly-deny",
    argv: ["node", "x.mjs"],
    outcome: deniedOutcome(undefined, { branch: "script:readonly-deny" }),
  },
  {
    name: "客户手拒（无 judge 审计）",
    argv: ["mysterytool", "--flag"],
    outcome: deniedOutcome(undefined, { branch: "c-review→a-deny" }),
  },
  {
    name: "pm b-deny（旧路径，无 judge 审计）",
    argv: ["mysterytool", "--flag"],
    outcome: deniedOutcome(undefined, { branch: "b-deny" }),
  },
  {
    name: "其它 manual（timeout，manualAsDeny===true）",
    argv: ["mysterytool", "--flag"],
    outcome: deniedOutcome(judgeDeny({ modelVerdict: "manual", reasonCode: "timeout", manualAsDeny: true }), { branch: "b-unsure→a-deny" }),
  },
  {
    name: "row-failed",
    argv: ["mysterytool", "--flag"],
    outcome: deniedOutcome(judgeDeny({ modelVerdict: "manual", reasonCode: "row-failed", manualAsDeny: true }), { branch: "c-review→a-deny" }),
  },
  {
    name: "judge allow（非拒绝）",
    argv: ["mysterytool", "--flag"],
    outcome: allowOutcome({ judge: judgeDeny({ verdict: "allow" }), branch: "b-allow" }),
  },
];

for (const item of INELIGIBLE_CASES) {
  test(`不可申请：${item.name} → 工具拒绝、不弹卡、不调 judge/客户`, async () => {
    const req = reqOf(item.argv, item.req ?? {});
    assert.equal(escalationEligibility(req, item.outcome), undefined, "资格判定应为不可申请");
    const h = makeSession();
    h.session.recordReview(req, item.outcome);
    const receipt = await request(h, item.argv);
    assert.equal(receipt.ok, false);
    assert.equal(h.calls.length, 0, "不可申请不弹卡");
  });
}

test("不可申请：后台入口（start_background_task）的判拒不写入可申请台账", async () => {
  const h = makeSession();
  const argv = ["npm", "install", "lodash"];
  h.session.recordReview(reqOf(argv, { entry: "start_background_task" }), deniedOutcome(judgeDeny()));
  const receipt = await request(h, argv);
  assert.equal(receipt.ok, false, "后台判拒不可申请");
  assert.equal(h.calls.length, 0);
});

// —————————————————————— C. 旧记录清理 / 最近一次审核 ——————————————————————

test("旧记录清理：judge deny 后同一 key 被 judge allow ⇒ 删除 recorded，申请被拒", async () => {
  const h = makeSession();
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  h.session.recordReview(reqOf(argv), allowOutcome({ judge: judgeDeny({ verdict: "allow" }) }));
  const receipt = await request(h, argv);
  assert.equal(receipt.ok, false);
  assert.match(receipt.message, /未找到可申请的判拒记录/);
  assert.equal(h.calls.length, 0);
});

for (const [name, outcome] of [
  ["客户手拒", deniedOutcome(undefined, { branch: "c-review→a-deny" })],
  ["其它 manual", deniedOutcome(judgeDeny({ modelVerdict: "manual", reasonCode: "budget", manualAsDeny: true }), { branch: "b-unsure→a-deny" })],
] as const) {
  test(`旧记录清理：judge deny 后同一 key 出现${name} ⇒ 记录被清除，申请被拒`, async () => {
    const h = makeSession();
    const argv = ["mysterytool", "--flag"];
    recordJudgeDeny(h, argv);
    h.session.recordReview(reqOf(argv), outcome);
    assert.equal((await request(h, argv)).ok, false);
    assert.equal(h.calls.length, 0);
  });
}

test("后台 review 不清除 run_shell 记录：判拒 → 后台 review → 申请仍可出卡", async () => {
  const h = makeSession();
  const argv = ["npm", "install", "lodash"];
  recordJudgeDeny(h, argv);
  h.session.recordReview(reqOf(argv, { entry: "start_background_task" }), allowOutcome());
  h.setDecision({ action: "deny" });
  const receipt = await request(h, argv);
  assert.equal(h.calls.length, 1, "后台 review 只忽略，不得清除前台记录");
  assert.equal(receipt.state, "denied");
});

test("资格只认最近一次审核：deny → allow → deny ⇒ 新判拒记录可申请", async () => {
  const h = makeSession();
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  h.session.recordReview(reqOf(argv), allowOutcome());
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "deny" });
  const receipt = await request(h, argv);
  assert.equal(h.calls.length, 1, "最近一次审核仍是判拒 ⇒ 可申请");
  assert.equal(receipt.state, "denied");
});

// —————————————————————— D. 状态机 / 回执 ——————————————————————

test("状态机：allow-once → granted-once → 下一次精确匹配消费 → consumed（不可再申请）", async () => {
  const h = makeSession();
  const argv = ["npm", "install", "lodash"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "allow-once", operatorId: "cust-1" });
  assert.equal((await request(h, argv)).state, "granted-once");

  const first = h.session.takeGrant(reqOf(argv));
  assert.ok(first !== undefined && first !== "stale");
  assert.equal(first.scope, "once");
  assert.equal(first.requestId, "req-1");
  assert.equal(first.operatorId, "cust-1");
  assert.equal(h.session.takeGrant(reqOf(argv)), undefined, "once 已被原子消费");
  // 消费后的 review（allow + grant）不清除终态；再次申请仍然拒绝（每命令每会话一次）。
  h.session.recordReview(reqOf(argv), allowOutcome({ result: { allow: true, by: "customer:cust-1（grant:req-1）", grant: first }, branch: BRANCH_CUSTOMER_ESCALATION_ALLOW_ONCE }));
  const again = await request(h, argv);
  assert.equal(again.ok, false);
  assert.equal(again.state, "consumed");
  assert.equal(h.calls.length, 1, "不弹第二张卡");
});

test("状态机：allow-session 反复放行；会话 dispose 后失效（重建 fail-closed）", async () => {
  const h = makeSession();
  const argv = ["npm", "install", "lodash"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "allow-session", operatorId: "cust-1" });
  assert.equal((await request(h, argv)).state, "granted-session");
  for (let i = 0; i < 3; i += 1) {
    const grant = h.session.takeGrant(reqOf(argv));
    assert.ok(grant !== undefined && grant !== "stale");
    assert.equal(grant.scope, "session");
  }
  h.session.dispose();
  assert.equal(h.session.takeGrant(reqOf(argv)), undefined, "会话结束/重建 ⇒ 授权失效");
  assert.equal((await request(h, argv)).ok, false, "重建后无台账（fail-closed）");
});

test("状态机：客户拒绝 → denied，回执明确未获允许且不可再申请", async () => {
  const h = makeSession();
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "deny", operatorId: "cust-3" });
  const receipt = await request(h, argv);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.state, "denied");
  assert.match(receipt.message, /未获客户允许/);
  assert.match(receipt.message, /不再受理同一命令/);
  assert.equal((await request(h, argv)).ok, false);
  assert.equal(h.calls.length, 1);
});

for (const [name, decision] of [
  ["expired", { action: "expired" }],
  ["unavailable", { action: "unavailable" }],
  ["非法动作", { action: "allow-everything" }],
  ["null 回包", null],
] as const) {
  test(`状态机：${name} 回包 ⇒ 默认拒绝（expired），消耗申请权且不可再申请`, async () => {
    const h = makeSession();
    const argv = ["mysterytool", "--flag"];
    recordJudgeDeny(h, argv);
    h.setDecision(decision as unknown as ShellEscalationDecision);
    const receipt = await request(h, argv);
    assert.equal(receipt.ok, false);
    assert.equal(receipt.state, "expired");
    assert.match(receipt.message, /未获客户允许/);
    assert.equal((await request(h, argv)).ok, false);
    assert.equal(h.calls.length, 1);
  });
}

test("状态机：presenter 抛错 ⇒ expired（fail-closed，不产生授权）", async () => {
  const h = makeSession();
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  h.setDecision(() => Promise.reject(new Error("窗口已关闭")));
  const receipt = await request(h, argv);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.state, "expired");
  assert.equal(h.session.takeGrant(reqOf(argv)), undefined);
});

test("状态机：presenter 超时 ⇒ expired（呈现超时链兜底）", async () => {
  const h = makeSession({ presentTimeoutMs: 20 });
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  h.setDecision(() => new Promise<ShellEscalationDecision>(() => {}));
  const receipt = await request(h, argv);
  assert.equal(receipt.state, "expired");
  assert.equal(h.calls.length, 1);
});

test("状态机：轮次已中止（signal aborted）⇒ 不出卡、expired", async () => {
  const h = makeSession();
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  const controller = new AbortController();
  controller.abort();
  const receipt = await request(h, argv, undefined, controller.signal);
  assert.equal(receipt.state, "expired");
  assert.equal(h.calls.length, 0, "轮次中止不弹卡");
});

test("并发/待答：同会话同时最多 1 张待答申请；待答期间新申请直接拒绝（不排队）", async () => {
  const h = makeSession();
  const argvA = ["mysterytool", "--a"];
  const argvB = ["mysterytool", "--b"];
  recordJudgeDeny(h, argvA);
  recordJudgeDeny(h, argvB);
  let resolveFirst!: (decision: ShellEscalationDecision) => void;
  h.setDecision(() => new Promise<ShellEscalationDecision>((resolve) => { resolveFirst = resolve; }));
  const first = request(h, argvA);
  // 等首张申请进入 requested（presenter 被调用）。
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.calls.length, 1);
  const second = await request(h, argvB);
  assert.equal(second.ok, false);
  assert.equal(second.state, "pending");
  assert.equal(h.calls.length, 1, "待答期间不弹第二张卡");
  resolveFirst({ action: "allow-once" });
  assert.equal((await first).state, "granted-once");
  // 待答清除后，另一命令可再次申请（其申请权未被 pending 拒绝消耗）。
  h.setDecision({ action: "deny" });
  const third = await request(h, argvB);
  assert.equal(third.state, "denied");
  assert.equal(h.calls.length, 2);
});

test("E2 R2：presenter 返回 pending ⇒ 回滚消耗（无审计、额度/申请权归还），同命令稍后再申请成功", async () => {
  // maxRequestsPerSession=1：若 pending 消耗了额度，第二次申请会被 capped；本用例证明回滚生效。
  const h = makeSession({ maxRequestsPerSession: 1 });
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  assert.equal(h.audit.records.length, 0, "初始无审计记录");

  // 第一次：呈现端因「已有待答 shell 卡」返回 pending —— 不是客户决定、不是默认拒绝。
  h.setDecision({ action: "pending", reason: "审批卡待答" });
  const first = await request(h, argv);
  assert.equal(first.ok, false);
  assert.equal(first.state, "pending");
  assert.match(first.message, /当前有 pending shell 确认卡/);
  assert.match(first.message, /未弹卡/);
  assert.equal(h.calls.length, 1, "presenter 被调用一次（回 pending）");
  assert.equal(escalationRecords(h.audit).length, 0, "pending 不写 escalation-decision 审计（无客户决定）");

  // 记录未终态 + 每命令申请权/会话额度已归还：同命令第二次申请可再次呈现并成功。
  h.setDecision({ action: "allow-once", operatorId: "cust-9" });
  const second = await request(h, argv);
  assert.equal(second.ok, true);
  assert.equal(second.state, "granted-once");
  assert.equal(h.calls.length, 2, "同命令稍后可再次呈现（未被每命令一次/额度拦下）");
  const records = escalationRecords(h.audit);
  assert.equal(records.length, 1, "只有真正呈现并得到客户决定的申请写一条审计");
  assert.equal(records[0]!.branch, BRANCH_ESCALATION_GRANTED_ONCE);
  assert.deepEqual(records[0]!.escalation?.action, "allow-once");
  assert.equal(typeof h.session.takeGrant(reqOf(argv)), "object", "第二次申请产生的授权可用");
});

test("E2 R2：多次 pending 不累计消耗会话额度（5 次额度仍可用于真实申请）", async () => {
  const h = makeSession(); // 默认上限 5
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "pending" });
  for (let i = 0; i < 6; i += 1) {
    const receipt = await request(h, argv);
    assert.equal(receipt.state, "pending", `第 ${i + 1} 次 pending 不改变状态`);
  }
  assert.equal(h.calls.length, 6);
  assert.equal(escalationRecords(h.audit).length, 0, "全部 pending 均无审计");
  // 额度未被 6 次 pending 吞噬：仍可完成一次真实申请。
  h.setDecision({ action: "deny", operatorId: "cust-1" });
  const real = await request(h, argv);
  assert.equal(real.state, "denied", "pending 回滚后额度与申请权仍在");
  assert.equal(h.calls.length, 7);
  assert.equal(escalationRecords(h.audit).length, 1);
});

// —————————————————————— E. 限流 ——————————————————————

test("限流：同一命令每会话最多一次（拒绝后再次申请也被拒，不弹卡）", async () => {
  const h = makeSession();
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "deny" });
  assert.equal((await request(h, argv)).state, "denied");
  assert.equal((await request(h, argv)).ok, false);
  assert.equal(h.calls.length, 1);
});

test("限流：会话总上限默认 5；第 6 次拒绝且不弹卡", async () => {
  const h = makeSession();
  h.setDecision({ action: "deny" });
  for (let i = 0; i < 5; i += 1) {
    recordJudgeDeny(h, ["cmd", String(i)]);
    assert.equal((await request(h, ["cmd", String(i)])).state, "denied", `第 ${i + 1} 次申请应在额度内`);
  }
  assert.equal(h.calls.length, 5);
  recordJudgeDeny(h, ["cmd", "5"]);
  const capped = await request(h, ["cmd", "5"]);
  assert.equal(capped.ok, false);
  assert.equal(capped.state, "capped");
  assert.match(capped.message, /上限（5 次）/);
  assert.equal(h.calls.length, 5, "超限不弹卡");
});

test("限流：maxRequestsPerSession 可注入（1 次）", async () => {
  const h = makeSession({ maxRequestsPerSession: 1 });
  h.setDecision({ action: "deny" });
  recordJudgeDeny(h, ["cmd", "0"]);
  recordJudgeDeny(h, ["cmd", "1"]);
  assert.equal((await request(h, ["cmd", "0"])).state, "denied");
  assert.equal((await request(h, ["cmd", "1"])).state, "capped");
  assert.equal(h.calls.length, 1);
});

test("必要性上限：>500 字符或 >1KB 拒绝且不弹卡；未提交申请", async () => {
  const h = makeSession();
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  const tooManyChars = "a".repeat(501);
  const r1 = await request(h, argv, tooManyChars);
  assert.equal(r1.ok, false);
  assert.equal(r1.state, "invalid");
  assert.match(r1.message, /500 字符/);
  const tooManyBytes = "汉".repeat(400); // 400 chars, 1200 bytes
  const r2 = await request(h, argv, tooManyBytes);
  assert.equal(r2.state, "invalid");
  assert.match(r2.message, /字节/);
  assert.equal(h.calls.length, 0);
  // 未提交的申请不消耗申请权：合规必要性仍可申请。
  h.setDecision({ action: "deny" });
  assert.equal((await request(h, argv, "推进任务需要")).state, "denied");
});

// —————————————————————— F. 授权键精确性（once/session） ——————————————————————

test("键精确性：argv 全等才交接（派生命令/改参数不生效，且不消费一次性授权）", async () => {
  const h = makeSession();
  const argv = ["npm", "install", "lodash"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "allow-once" });
  await request(h, argv);
  assert.equal(h.session.takeGrant(reqOf(["npm", "install", "lodash@4"])), undefined, "加参数=新命令");
  assert.equal(h.session.takeGrant(reqOf(["npm", "install"])), undefined);
  assert.equal(h.session.takeGrant(reqOf(["NPM", "install", "lodash"])), undefined, "改大小写=新命令");
  const grant = h.session.takeGrant(reqOf(argv));
  assert.ok(grant !== undefined && grant !== "stale", "不匹配的调用不消费一次性授权");
});

test("键精确性：cwd / 角色 / 项目不同不生效（不跨会话交接）", async () => {
  const h = makeSession();
  const argv = ["npm", "install", "lodash"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "allow-once" });
  await request(h, argv);
  assert.equal(h.session.takeGrant(reqOf(argv, { cwd: "/other" })), undefined, "cwd 不同不生效");
  // 不同角色 / 不同项目 = 不同 registry（每会话闭包）；此处的授权只在本 registry 内。
  const otherRole = makeSession({ roleId: "other" });
  recordJudgeDeny(otherRole, argv);
  assert.equal(otherRole.session.takeGrant(reqOf(argv)), undefined, "未申请的 registry 无授权");
  const otherProject = makeSession({ projectRoot: "/other-proj" });
  recordJudgeDeny(otherProject, argv);
  assert.equal(otherProject.session.takeGrant(reqOf(argv, { cwd: "/other-proj" })), undefined);
  assert.ok(h.session.takeGrant(reqOf(argv)) !== undefined, "原会话授权仍在");
});

test("键精确性：后台入口 takeGrant 不消费也不交接前台授权", async () => {
  const h = makeSession();
  const argv = ["npm", "install", "lodash"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "allow-once" });
  await request(h, argv);
  assert.equal(h.session.takeGrant(reqOf(argv, { entry: "start_background_task" })), undefined, "后台入口不得消费前台授权");
  const grant = h.session.takeGrant(reqOf(argv));
  assert.ok(grant !== undefined && grant !== "stale", "前台授权未被后台调用吃掉");
});

test("会话授权：同 cwd/argv 反复放行；派生命令不继承", async () => {
  const h = makeSession();
  const argv = ["npm", "install", "lodash"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "allow-session" });
  await request(h, argv);
  assert.ok(h.session.takeGrant(reqOf(argv)) !== undefined);
  assert.ok(h.session.takeGrant(reqOf(argv)) !== undefined, "会话内可反复放行");
  assert.equal(h.session.takeGrant(reqOf(argv, { cwd: "/other" })), undefined);
  assert.equal(h.session.takeGrant(reqOf(["npm", "install", "react"])), undefined);
});

// —————————————————————— G. 脚本上下文 sha256 时效（stale） ——————————————————————

const contextOf = (sha: string): ShellApprovalContext => ({
  scripts: [{ label: "node 脚本", content: "console.log(1)", bytes: 14, sha256: sha }],
  scriptPaths: ["scripts/x.mjs"],
  note: "有界上下文",
});

test("digestApprovalContext：稳定、仅随内容/路径变化；undefined ⇒ undefined", () => {
  assert.equal(digestApprovalContext(undefined), undefined);
  const a = contextOf("a".repeat(64));
  assert.equal(digestApprovalContext(a), digestApprovalContext({ ...a }));
  assert.notEqual(digestApprovalContext(a), digestApprovalContext(contextOf("b".repeat(64))));
  assert.notEqual(digestApprovalContext(a), digestApprovalContext({ ...a, scriptPaths: ["scripts/y.mjs"] }));
});

test("stale：once 授权消费时脚本上下文变化 ⇒ 拒绝、授权作废、终态不可再申请", async () => {
  const h = makeSession();
  const argv = ["node", "scripts/x.mjs"];
  recordJudgeDeny(h, argv, { req: { approvalContext: contextOf("a".repeat(64)) }, branch: "script:review→a-deny" });
  h.setDecision({ action: "allow-once" });
  await request(h, argv);
  const stale = h.session.takeGrant(reqOf(argv, { approvalContext: contextOf("b".repeat(64)) }));
  assert.equal(stale, "stale");
  assert.equal(h.session.takeGrant(reqOf(argv, { approvalContext: contextOf("a".repeat(64)) })), undefined, "授权已作废");
  assert.equal((await request(h, argv)).state, "consumed", "stale 后终态，不可再申请");
});

test("stale：上下文不可读（undefined）也按 stale 拒绝（fail-closed）", async () => {
  const h = makeSession();
  const argv = ["node", "scripts/x.mjs"];
  recordJudgeDeny(h, argv, { req: { approvalContext: contextOf("a".repeat(64)) }, branch: "script:review→a-deny" });
  h.setDecision({ action: "allow-session" });
  await request(h, argv);
  assert.equal(h.session.takeGrant(reqOf(argv)), "stale", "判拒时有上下文、消费时不可读 ⇒ stale");
});

test("stale：会话授权每次消费都比对 sha256（未变化则持续有效）", async () => {
  const h = makeSession();
  const argv = ["node", "scripts/x.mjs"];
  const context = contextOf("a".repeat(64));
  recordJudgeDeny(h, argv, { req: { approvalContext: context }, branch: "script:review→a-deny" });
  h.setDecision({ action: "allow-session" });
  await request(h, argv);
  assert.ok(h.session.takeGrant(reqOf(argv, { approvalContext: context })) !== undefined);
  assert.equal(h.session.takeGrant(reqOf(argv, { approvalContext: contextOf("c".repeat(64)) })), "stale");
});

test("非脚本授权不做 sha256 比对（判拒记录无上下文）", async () => {
  const h = makeSession();
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "allow-once" });
  await request(h, argv);
  const grant = h.session.takeGrant(reqOf(argv, { approvalContext: contextOf("a".repeat(64)) }));
  assert.ok(grant !== undefined && grant !== "stale");
});

// —————————————————————— H. 审计（escalation-decision） ——————————————————————

function escalationRecords(audit: ReturnType<typeof createMemoryAuditSink>): ShellAuditRecord[] {
  return audit.records.filter((record) => record.event === "escalation-decision");
}

test("审计：允许一次/本会话/拒绝/超时各写一条完整 escalation-decision（同一 sink、append-only）", async () => {
  const h = makeSession();
  h.setDecision({ action: "allow-once", operatorId: "cust-1" });
  recordJudgeDeny(h, ["cmd", "once"]);
  await request(h, ["cmd", "once"]);

  h.setDecision({ action: "allow-session", operatorId: "cust-2" });
  recordJudgeDeny(h, ["cmd", "session"]);
  await request(h, ["cmd", "session"]);

  h.setDecision({ action: "deny", operatorId: "cust-3" });
  recordJudgeDeny(h, ["cmd", "deny"]);
  await request(h, ["cmd", "deny"]);

  h.setDecision({ action: "expired" });
  recordJudgeDeny(h, ["cmd", "expired"]);
  await request(h, ["cmd", "expired"]);

  const records = escalationRecords(h.audit);
  assert.equal(records.length, 4, "四种决定各一条记录");
  const byBranch = new Map(records.map((record) => [record.branch, record]));
  assert.deepEqual([...byBranch.keys()].sort(), [
    BRANCH_ESCALATION_DENIED,
    BRANCH_ESCALATION_EXPIRED,
    BRANCH_ESCALATION_GRANTED_ONCE,
    BRANCH_ESCALATION_GRANTED_SESSION,
  ].sort());

  const once = byBranch.get(BRANCH_ESCALATION_GRANTED_ONCE)!;
  assert.equal(once.conclusion, "allow");
  assert.equal(once.by, "operator:cust-1");
  assert.equal(once.toolCallId, "");
  assert.equal(once.command, "cmd once", "审计用判拒原文");
  assert.deepEqual(once.argv, ["cmd", "once"]);
  assert.equal(once.cwd, ROOT);
  assert.equal(once.execution, "未执行");
  assert.deepEqual(once.conditions, ["shell-gate"]);
  assert.equal(once.event, "escalation-decision");
  assert.deepEqual(once.escalation, { requestId: "req-1", action: "allow-once", roleId: ROLE });
  assert.equal(once.timestamp, NOW.toISOString());

  const denied = byBranch.get(BRANCH_ESCALATION_DENIED)!;
  assert.equal(denied.conclusion, "deny");
  assert.deepEqual(denied.escalation, { requestId: "req-3", action: "deny", roleId: ROLE });
  const expired = byBranch.get(BRANCH_ESCALATION_EXPIRED)!;
  assert.equal(expired.conclusion, "timeout");
  assert.equal(expired.by, "operator:unavailable");
  assert.deepEqual(expired.escalation, { requestId: "req-4", action: "expired", roleId: ROLE });
});

test("审计：卡与审计的命令原文取自判拒记录（不取模型本次输入）", async () => {
  const h = makeSession();
  const argv = ["npm", "install", "lodash"];
  h.session.recordReview(
    { command: "npm   install   lodash", argv, cwd: ROOT, toolCallId: "tc-9", entry: "run_shell" },
    deniedOutcome(judgeDeny()),
  );
  h.setDecision({ action: "deny" });
  await request(h, argv); // 模型输入 command 是 "npm install lodash"
  assert.equal(h.calls[0]!.command, "npm   install   lodash", "卡上命令逐字取自判拒记录");
  assert.equal(escalationRecords(h.audit)[0]!.command, "npm   install   lodash");
});

test("审计：sink 故障不翻转决定（回执仍如实、授权仍按客户决定创建）", async () => {
  const failing = { async append() { return { ok: false as const, reason: "门禁拒绝" }; } };
  const h = makeSession();
  h.session.bindAudit(failing);
  const argv = ["mysterytool", "--flag"];
  recordJudgeDeny(h, argv);
  h.setDecision({ action: "allow-once" });
  const receipt = await request(h, argv);
  assert.equal(receipt.ok, true);
  assert.ok(h.session.takeGrant(reqOf(argv)) !== undefined, "审计失败不影响已成立的客户授权");
});

// —————————————————————— I. 回滚开关 ——————————————————————

test("回滚开关：ANS_SHELL_ESCALATION_DISABLED=1 判定（仅精确值 1）", () => {
  assert.equal(shellEscalationDisabled({ [SHELL_ESCALATION_DISABLED_ENV]: "1" }), true);
  assert.equal(shellEscalationDisabled({ [SHELL_ESCALATION_DISABLED_ENV]: "0" }), false);
  assert.equal(shellEscalationDisabled({}), false);
  assert.equal(shellEscalationDisabled({ [SHELL_ESCALATION_DISABLED_ENV]: "true" }), false);
});

// —————————————————————— J. 闸接线：onReviewed / takeGrant / onAuditSinkCreated ——————————————————————

/** 简易闸夹具：classify 可注入，操作者返回 judge 判拒。 */
function gateHarness(opts: {
  classify?: "allow" | "review" | "risky" | "deny";
  writeGuard?: "script" | "deny" | "pass";
  loader?: ShellApprovalContext;
  loaderFails?: boolean;
  session?: ShellEscalationSession;
}) {
  const audit = createMemoryAuditSink();
  const reviewed: Array<{ req: ShellReviewRequest; outcome: ShellGateReviewedOutcome }> = [];
  const sinkCallbacks: unknown[] = [];
  const operatorPrompts: number[] = [];
  const gate = createShellGate({
    projectRoot: ROOT,
    classifyShell: () => opts.classify ?? "review",
    rules: { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] },
    audit,
    operatorChannel: () => {
      operatorPrompts.push(1);
      return {
        outcome: "deny",
        operatorId: "judge",
        reason: "判拒",
        judge: judgeDeny(),
      };
    },
    ...(opts.writeGuard !== undefined
      ? {
          writeGuard: () =>
            opts.writeGuard === "pass"
              ? ({ kind: "pass" as const })
              : opts.writeGuard === "script"
                ? ({ kind: "script" as const, reason: "守卫" })
                : ({ kind: "deny" as const, reason: "守卫", targets: [] }),
        }
      : {}),
    ...(opts.loader !== undefined || opts.loaderFails === true
      ? {
          approvalContextLoader: async () =>
            opts.loaderFails === true
              ? ({ ok: false as const, reason: "脚本不可读" })
              : ({ ok: true as const, context: opts.loader! }),
        }
      : {}),
    onReviewed: (req, outcome) => {
      reviewed.push({ req, outcome });
      opts.session?.recordReview(req, outcome);
    },
    ...(opts.session !== undefined
      ? {
          takeGrant: (req, context) => opts.session!.takeGrant(req, context),
          onAuditSinkCreated: (sink) => {
            sinkCallbacks.push(sink);
            opts.session!.bindAudit(sink);
          },
        }
      : {}),
  });
  return { gate, audit, reviewed, sinkCallbacks, operatorPrompts };
}

test("闸接线：onReviewed 与审计同址（每判定一次）；onAuditSinkCreated 共享同一 sink", async () => {
  const audit = createMemoryAuditSink();
  const shared: unknown[] = [];
  const seen: ShellGateReviewedOutcome[] = [];
  const gate = buildShellGate({
    classifyShell: () => "allow",
    rules: { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] },
    projectRoot: ROOT,
    skillRoot: ROOT,
    pmBoundary: { entries: [], boundarySource: "test", acceptance: { accepted: true, source: "test" } },
    auditSink: audit,
    onReviewed: (_req, outcome) => seen.push(outcome),
    onAuditSinkCreated: (sink) => shared.push(sink),
  });
  const r = await gate(reqOf(["ls"]));
  assert.equal(r.allow, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.branch, "c-allow");
  assert.equal(shared.length, 1);
  assert.equal(shared[0], audit, "升级 registry 与 review 记录共享同一 sink");
});

test("闸接线：script 分支以带 approvalContext 的请求回调 onReviewed 与 takeGrant", async () => {
  const context = contextOf("a".repeat(64));
  const h = makeSession();
  const { gate } = gateHarness({
    classify: "review",
    writeGuard: "script",
    loader: context,
    session: h.session,
  });
  const req = reqOf(["node", "scripts/x.mjs"]);
  const r = await gate(req);
  assert.equal(r.allow, false, "首次 judge 判拒");
  // 通过 registry 申请到 allow-once（judge 判拒记录来自 onReviewed）。
  h.setDecision({ action: "allow-once", operatorId: "cust-1" });
  const receipt = await h.session.request({ command: "node scripts/x.mjs", argv: req.argv });
  assert.equal(receipt.state, "granted-once");
  const granted = await gate(req);
  assert.equal(granted.allow, true, "原样重试由客户升级授权放行");
  if (granted.allow) {
    assert.equal(granted.grant?.scope, "once");
    assert.match(granted.by, /^customer:cust-1（grant:req-1）$/);
  }
});

// —————————————————————— K. openRoleSession 接线 / 回滚开关 ——————————————————————

function makeRoleProject(): { project: ProjectConfig; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-escalation-"));
  const role = path.join(root, "角色卡", "X");
  fs.mkdirSync(role, { recursive: true });
  fs.writeFileSync(path.join(role, "role-card.md"), "# X\n");
  fs.writeFileSync(path.join(role, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: fixture\n");
  return {
    root,
    project: {
      projectRoot: root,
      skillRoot: root,
      roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
      builtInRoles: ["su"],
      governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test" } },
    },
  };
}

/** 捕获能力面的适配器桩。 */
function capsCapturingAdapter(): {
  createAdapter: (gate: unknown, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  return {
    createAdapter: (_gate, capabilities): RuntimeAdapter => {
      captured = capabilities;
      return {
        async composeContext() { return { systemPrompt: "" }; },
        async bindRole() {
          return {
            async prompt() {},
            events(): AsyncIterable<never> { return (async function* () {})(); },
            async dispose() {},
          } as never;
        },
      };
    },
    caps: () => captured,
  };
}

test("openRoleSession：presenter 注入 ⇒ shellEscalation 能力位到达适配器；判拒→申请→授权放行端到端", async () => {
  const { project, root } = makeRoleProject();
  const adapter = capsCapturingAdapter();
  const audit = createMemoryAuditSink();
  const cards: ShellEscalationCardRequest[] = [];
  let decision: ShellEscalationDecision = { action: "allow-once", operatorId: "cust-9" };
  try {
    const handle = await openRoleSession(
      {
        roleId: "X",
        project,
        shellOperatorChannel: () => ({
          outcome: "deny",
          operatorId: "judge",
          reason: "判拒",
          judge: judgeDeny(),
        }),
        shellArming: {
          classifyShell: () => "review",
          rules: { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] },
          auditSink: audit,
        },
        shellEscalationPresenter: async (card) => {
          cards.push(card);
          return decision;
        },
        shellEscalationOptions: { now: () => NOW, presentTimeoutMs: 1000, env: {} },
      },
      { createAdapter: adapter.createAdapter },
    );
    const caps = adapter.caps();
    assert.equal(typeof caps?.shellGate, "function", "shell 已 arm");
    assert.equal(typeof caps?.shellEscalation, "function", "presenter 注入 ⇒ 升级工具能力注入（注入才注册）");

    const req = reqOf(["mysterytool", "--flag"], { cwd: root });
    const first = await caps!.shellGate!(req);
    assert.equal(first.allow, false, "首次 judge 判拒");
    // 审计：review 记录与 escalation-decision 写同一 sink。
    const receipt = await caps!.shellEscalation!({ command: "mysterytool --flag", argv: ["mysterytool", "--flag"] });
    assert.equal(receipt.state, "granted-once");
    assert.equal(cards.length, 1);
    assert.equal(cards[0]!.command, "mysterytool --flag");
    decision = { action: "deny" };
    const second = await caps!.shellGate!(req);
    assert.equal(second.allow, true, "原样重试由客户升级授权放行");
    if (second.allow) assert.equal(second.grant?.scope, "once");
    const grantReviews = audit.records.filter((record) => record.customerGrant !== undefined);
    assert.equal(grantReviews.length, 1);
    assert.equal(grantReviews[0]!.branch, BRANCH_CUSTOMER_ESCALATION_ALLOW_ONCE);
    assert.equal(grantReviews[0]!.judge, undefined, "客户授权放行不写 judge");
    assert.match(grantReviews[0]!.by, /^customer:cust-9（grant:/);
    assert.equal(audit.records.filter((record) => record.event === "escalation-decision").length, 1);
    await handle.dispose();
    // dispose 后授权失效（会话结束/重建）——capabilities 仍是闭包，但 registry 已清空。
    assert.equal((await caps!.shellGate!(req)).allow, false, "会话 dispose 后授权失效（fail-closed）");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("openRoleSession：ANS_SHELL_ESCALATION_DISABLED=1 ⇒ registry 不创建、工具能力不注入", async () => {
  const { project, root } = makeRoleProject();
  const adapter = capsCapturingAdapter();
  try {
    const handle = await openRoleSession(
      {
        roleId: "X",
        project,
        shellOperatorChannel: () => ({ outcome: "deny" }),
        shellArming: {
          classifyShell: () => "review",
          rules: { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] },
          auditSink: createMemoryAuditSink(),
        },
        shellEscalationPresenter: async () => ({ action: "allow-once" }),
        shellEscalationOptions: { env: { [SHELL_ESCALATION_DISABLED_ENV]: "1" } },
      },
      { createAdapter: adapter.createAdapter },
    );
    const caps = adapter.caps();
    assert.equal(typeof caps?.shellGate, "function", "shell 仍 arm（白名单/审核链不受开关影响）");
    assert.equal(caps?.shellEscalation, undefined, "回滚开关 ⇒ 工具能力不注入（工具不注册）");
    await handle.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("openRoleSession：未提供 presenter ⇒ 不创建 registry（shellEscalation 缺席）", async () => {
  const { project, root } = makeRoleProject();
  const adapter = capsCapturingAdapter();
  try {
    const handle = await openRoleSession(
      {
        roleId: "X",
        project,
        shellOperatorChannel: () => ({ outcome: "deny" }),
        shellArming: {
          classifyShell: () => "review",
          rules: { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] },
          auditSink: createMemoryAuditSink(),
        },
      },
      { createAdapter: adapter.createAdapter },
    );
    assert.equal(adapter.caps()?.shellEscalation, undefined);
    await handle.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
