// test/编排/shell-risky-order.test.ts
// 编排角色自测（T41）：shell 审核链三层 (c)→(b)→(a) 对**第四档 `risky`** 的次序与终结（设计 §14.2 次序表）。
//
// 逐行覆盖 §14.2 那张表，并**证伪「pm 是终审」**——`risky` 下 (b) 判放行**仍须过 (a)**（b 不是终审，客户才是）；
// 而 `review` 下 (b) 判放行即**终结**（不打扰人）。两档**唯一**的差别（b 判放行后是否仍过 (a)）逐条对比。
// `risky` 下 (b) 判**拒绝**则终结、**不打扰人**（(a) 不被调用）。
//
// 只依赖本角色文件（common/编排/）+ 门禁引擎纯函数（classifyShell）；**不依赖真实模型、不触网络**。

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ShellClass } from "../../src/model/decision.ts";
import {
  createShellGate,
  escalateBranch,
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
  BRANCH_REVIEW_NO_BA,
  BRANCH_RISKY_NO_BA,
  BRANCH_B_ALLOW,
  BRANCH_B_DENY,
  BRANCH_B_UNSURE,
  BRANCH_B_UNAVAILABLE,
  BRANCH_B_TIMEOUT,
  BRANCH_B_UNPARSEABLE,
  BRANCH_A_ALLOW,
  BRANCH_A_DENY,
  BRANCH_A_UNAVAILABLE,
  BRANCH_A_TIMEOUT,
  type CreateShellGateOptions,
  type PmAskFn,
  type OperatorChannelFn,
  type ShellRules,
} from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import { classifyShell, defaultShellRules } from "../../src/common/门禁引擎/classify-shell.ts";

const RULES: ShellRules = { version: "3", readOnly: [], hardDenyPrograms: [], riskyPrograms: [], denyTokens: [] };
const RULES_ID = "test-ruleset";
// 一条「危险但有正当用途」的命令形态（真实分类由 stub 覆盖为 risky）。
const REQ = { command: "rm -rf build", argv: ["rm", "-rf", "build"], cwd: "/proj", toolCallId: "call-1" };

interface Spies {
  pm: PmAskFn;
  operator: OperatorChannelFn;
  pmCalls: () => number;
  opCalls: () => number;
}

/** 造一对会被计数的 (b)/(a) 桩；默认 (b) 放行、(a) 放行（「若被问就放行」）。 */
function spies(pmReply = '{"verdict":"allow"}', opOutcome: "allow" | "deny" | "unavailable" = "allow"): Spies {
  let pmCalls = 0;
  let opCalls = 0;
  const pm: PmAskFn = () => {
    pmCalls += 1;
    return pmReply;
  };
  const operator: OperatorChannelFn = () => {
    opCalls += 1;
    return { outcome: opOutcome, operatorId: "tester" };
  };
  return { pm, operator, pmCalls: () => pmCalls, opCalls: () => opCalls };
}

/** 装配一个三层 ShellGate（默认 (b)/(a) 均接桩），(c) 分类固定返回 `decision`。 */
function chain(decision: ShellClass, s: Spies, opts: Partial<CreateShellGateOptions> = {}) {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => decision,
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: s.pm,
    operatorChannel: s.operator,
    ...opts,
  });
  return { gate, audit };
}

// —————————————————————— 次序表行 1：allow ——————————————————————

test("次序表行 1：`allow` → **放行**，**不进 (b)/(a)**（桩未被调用）", async () => {
  const s = spies('{"verdict":"deny"}', "deny"); // 桩本会拒——绝不该被问到
  const { gate, audit } = chain("allow", s);
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  if (!r.allow) return;
  assert.equal(r.by, "ruleset:test-ruleset");
  assert.equal(s.pmCalls(), 0, "allow 不进 (b)");
  assert.equal(s.opCalls(), 0, "allow 不进 (a)");
  assert.equal(audit.records[0].branch, BRANCH_C_ALLOW);
  assert.equal(audit.records[0].conclusion, "allow");
});

// —————————————————————— 次序表行 2：deny ——————————————————————

test("次序表行 2：`deny` → **终结拒**，**不进 (b)/(a)**（硬拒不可被翻案）", async () => {
  const s = spies('{"verdict":"allow"}', "allow"); // 桩本会放行——拦不住 c 的终结
  const { gate, audit } = chain("deny", s);
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(s.pmCalls(), 0, "deny 不进 (b)");
  assert.equal(s.opCalls(), 0, "deny 不进 (a)");
  assert.equal(audit.records[0].branch, BRANCH_C_DENY);
  assert.equal(audit.records[0].conclusion, "deny");
});

// —————————————————————— 次序表行 3：review ——————————————————————

test("次序表行 3（review）：(b) 判放行 → **终结放行，(a) 未被调用**（不打扰人）", async () => {
  const s = spies('{"verdict":"allow","sessionId":"pm-1","model":"m1"}', "deny");
  const { gate, audit } = chain("review", s);
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  if (!r.allow) return;
  assert.equal(r.by, "pm:pm-1(m1)");
  assert.equal(s.pmCalls(), 1);
  assert.equal(s.opCalls(), 0, "review 下 b 明确放行即终结，不打扰人");
  assert.equal(audit.records[0].branch, BRANCH_B_ALLOW);
});

test("次序表行 3（review）：(b) 判拒绝 → **终结拒绝，(a) 未被调用**（不打扰人）", async () => {
  const s = spies('{"verdict":"deny","reason":"该命令会写盘"}', "allow");
  const { gate, audit } = chain("review", s);
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.match(r.reason, /会写盘/);
  assert.equal(s.opCalls(), 0, "review 下 b 判拒即终结，不打扰人");
  assert.equal(audit.records[0].branch, BRANCH_B_DENY);
});

test("次序表行 3（review）：(b) 拿不准 → 升 (a)；(a) 放行 → 放行", async () => {
  const s = spies('{"verdict":"unsure"}', "allow");
  const { gate, audit } = chain("review", s);
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  assert.equal(s.opCalls(), 1, "(b) 拿不准即升 (a)");
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNSURE, BRANCH_A_ALLOW));
  assert.equal(audit.records[0].branch, "b-unsure→a-allow");
});

test("次序表行 3（review）：(b) 拿不准 → 升 (a)；(a) 拒绝 → 拒绝", async () => {
  const s = spies('{"verdict":"unsure"}', "deny");
  const { gate, audit } = chain("review", s);
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(s.opCalls(), 1);
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNSURE, BRANCH_A_DENY));
  assert.equal(audit.records[0].branch, "b-unsure→a-deny");
});

// —————————————————————— 次序表行 4：risky（本轮要害） ——————————————————————

test("★次序表行 4（risky）要害：**(b) 判放行 + (a) 拒绝 → 最终拒绝**（pm 不是终审，客户才是）", async () => {
  const s = spies('{"verdict":"allow","sessionId":"pm-1","model":"m1"}', "deny");
  const { gate, audit } = chain("risky", s);
  const r = await gate(REQ);
  assert.equal(r.allow, false, "即便 pm 判放行，客户拒绝即拒绝——b 不是终审");
  assert.equal(s.pmCalls(), 1);
  assert.equal(s.opCalls(), 1, "risky 下 b 判放行**仍必过 (a)**");
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_ALLOW, BRANCH_A_DENY));
  assert.equal(audit.records[0].branch, "b-allow→a-deny");
  assert.equal(audit.records[0].conclusion, "deny");
});

test("★次序表行 4（risky）：(b) 放行 + (a) 放行 → **放行，且 (a) 被调用过**", async () => {
  const s = spies('{"verdict":"allow","sessionId":"pm-1","model":"m1"}', "allow");
  const { gate, audit } = chain("risky", s);
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  if (!r.allow) return;
  assert.equal(s.pmCalls(), 1);
  assert.equal(s.opCalls(), 1, "(a) 必须被调用（这是与 review 的差别）");
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_ALLOW, BRANCH_A_ALLOW));
  assert.equal(audit.records[0].branch, "b-allow→a-allow");
  assert.equal(r.by, "pm:pm-1(m1) → operator:tester");
});

test("★次序表行 4（risky）：**(b) 判拒绝 → 终结拒绝，且 (a) 未被调用**（pm 说不该跑就不打扰人）", async () => {
  const s = spies('{"verdict":"deny","reason":"删根目录"}', "allow");
  const { gate, audit } = chain("risky", s);
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.match(r.reason, /删根目录/);
  assert.equal(s.pmCalls(), 1);
  assert.equal(s.opCalls(), 0, "risky 下 b 判拒即终结，不打扰人");
  assert.equal(audit.records[0].branch, BRANCH_B_DENY);
});

test("次序表行 4（risky）：(b) 拿不准 → 升 (a)；(a) 放行 → 放行 / (a) 拒绝 → 拒绝", async () => {
  const sAllow = spies('{"verdict":"unsure"}', "allow");
  const cAllow = chain("risky", sAllow);
  const rAllow = await cAllow.gate(REQ);
  assert.equal(rAllow.allow, true);
  assert.equal(sAllow.opCalls(), 1);
  assert.equal(cAllow.audit.records[0].branch, "b-unsure→a-allow");

  const sDeny = spies('{"verdict":"unsure"}', "deny");
  const cDeny = chain("risky", sDeny);
  const rDeny = await cDeny.gate(REQ);
  assert.equal(rDeny.allow, false);
  assert.equal(sDeny.opCalls(), 1);
  assert.equal(cDeny.audit.records[0].branch, "b-unsure→a-deny");
});

test("次序表行 4（risky）：(b) **无会话**（未注入 pmAsk）→ 升 (a)；(a) 放行 → 放行", async () => {
  const s = spies('{"verdict":"deny"}', "allow"); // pm 桩不该被用
  const { gate, audit } = chain("risky", s, { pmAsk: undefined });
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  assert.equal(s.pmCalls(), 0);
  assert.equal(s.opCalls(), 1, "risky 必过 (a)");
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNAVAILABLE, BRANCH_A_ALLOW));
  assert.equal(audit.records[0].branch, "b-unavailable→a-allow");
});

test("次序表行 4（risky）：(b) 审读**超时** → 升 (a)；(a) 拒绝 → 拒绝", async () => {
  const audit = createMemoryAuditSink();
  let opCalls = 0;
  const gate = createShellGate({
    classifyShell: () => "risky",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => new Promise<string>(() => {}), // 永不返回 → 超时
    pmTimeoutMs: 20,
    timeoutMs: 5000,
    operatorChannel: () => {
      opCalls += 1;
      return { outcome: "deny", operatorId: "bob" };
    },
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(opCalls, 1, "(b) 超时是升级、不是放行");
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_TIMEOUT, BRANCH_A_DENY));
  assert.equal(audit.records[0].branch, "b-timeout→a-deny");
});

test("次序表行 4（risky，M-2 改判）：(b) 输出**不可解析** → **直接拒绝**（fail-closed；**不升 (a)、不打扰客户**）", async () => {
  const s = spies("我觉得可以吧（这不是 JSON）", "deny");
  const { gate, audit } = chain("risky", s);
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(s.opCalls(), 0, "不可解析 → **不进 (a)**（客户裁定：这类失败不用发给我）");
  assert.equal(audit.records[0].branch, BRANCH_B_UNPARSEABLE);
  assert.equal(audit.records[0].branch, "b-unparseable-deny");
});

// —————————————————————— (a) 拒绝/超时/不可用/未接 → 拒绝（fail-closed） ——————————————————————

test("(a) 不可用 / 通道未接 / 确认超时 → **拒绝**（fail-closed，risky 亦不例外）", async () => {
  // (a) 返回 unavailable
  const s1 = spies('{"verdict":"allow"}', "unavailable");
  const c1 = chain("risky", s1);
  const r1 = await c1.gate(REQ);
  assert.equal(r1.allow, false);
  assert.equal(c1.audit.records[0].branch, escalateBranch(BRANCH_B_ALLOW, BRANCH_A_UNAVAILABLE));
  assert.equal(c1.audit.records[0].branch, "b-allow→a-unavailable");

  // (a) 通道未接入（注入了 (b) 但无 (a)）
  const audit2 = createMemoryAuditSink();
  const g2 = createShellGate({
    classifyShell: () => "risky",
    rules: RULES,
    rulesId: RULES_ID,
    audit: audit2,
    pmAsk: () => '{"verdict":"allow"}',
  });
  const r2 = await g2(REQ);
  assert.equal(r2.allow, false, "risky 但 (a) 未接 ⇒ 拒（不因缺 (a) 而放行）");
  assert.equal(audit2.records[0].branch, escalateBranch(BRANCH_B_ALLOW, BRANCH_A_UNAVAILABLE));

  // (a) 确认超时
  const audit3 = createMemoryAuditSink();
  const g3 = createShellGate({
    classifyShell: () => "risky",
    rules: RULES,
    rulesId: RULES_ID,
    audit: audit3,
    pmAsk: () => '{"verdict":"allow"}',
    operatorChannel: () => new Promise(() => {}), // 人永不回答
    operatorTimeoutMs: 20,
    timeoutMs: 5000,
  });
  const r3 = await g3(REQ);
  assert.equal(r3.allow, false);
  assert.equal(audit3.records[0].branch, escalateBranch(BRANCH_B_ALLOW, BRANCH_A_TIMEOUT));
  assert.equal(audit3.records[0].branch, "b-allow→a-timeout");
});

// —————————————————————— (c)-only 装配：review / risky 皆默认拒 ——————————————————————

test("(c)=risky 且 (b)/(a) 均未接入 → 默认拒绝（fail-closed，分支 risky-default-deny）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({ classifyShell: () => "risky", rules: RULES, rulesId: RULES_ID, audit });
  const r = await gate(REQ);
  assert.equal(r.allow, false, "risky 必过 (a)，两侧皆缺席无从确认 ⇒ 拒");
  if (r.allow) return;
  assert.match(r.reason, /risky/);
  assert.equal(audit.records[0].branch, BRANCH_RISKY_NO_BA);
  assert.equal(audit.records[0].conclusion, "deny");
});

test("(c)=review 且 (b)/(a) 均未接入 → 默认拒绝（分支 review-default-deny，未因本轮改动而变）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({ classifyShell: () => "review", rules: RULES, rulesId: RULES_ID, audit });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(audit.records[0].branch, BRANCH_REVIEW_NO_BA);
});

// —————————————————————— 差别证明：review vs risky（同「b 判放行」） ——————————————————————

test("★差别证明：同「(b) 判放行」下——review **不打扰人**；risky **必过 (a)**（唯一差别）", async () => {
  // review：b 放行即放行，即便 (a) 本会拒绝
  const sReview = spies('{"verdict":"allow"}', "deny");
  const rv = await chain("review", sReview).gate(REQ);
  assert.equal(rv.allow, true, "review：b 放行即放行（(a) 不参与）");
  assert.equal(sReview.pmCalls(), 1);
  assert.equal(sReview.opCalls(), 0, "review：不打扰人");

  // risky：b 放行仍过 (a)，(a) 拒 → 拒
  const sRisky = spies('{"verdict":"allow"}', "deny");
  const rk = await chain("risky", sRisky).gate(REQ);
  assert.equal(rk.allow, false, "risky：b 放行仍过 (a)，(a) 拒绝即拒绝");
  assert.equal(sRisky.pmCalls(), 1);
  assert.equal(sRisky.opCalls(), 1, "risky：必打扰人");
});

// —————————————————————— 集成：门禁引擎真判 → 三层链（T40 → T41 端到端） ——————————————————————

test("集成：门禁引擎真判 `rm -rf build`=risky → (b) 放行 + (a) 拒绝 → **最终拒绝**", async () => {
  const rules = defaultShellRules();
  // 前提：T40 已把 rm 从硬拒改判 risky。
  assert.equal(classifyShell(["rm", "-rf", "build"], rules), "risky");

  const s = spies('{"verdict":"allow"}', "deny");
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: (argv, r) => classifyShell(argv, r),
    rules,
    rulesId: rules.id,
    audit,
    pmAsk: s.pm,
    operatorChannel: s.operator,
  });
  const r = await gate({ command: "rm -rf build", argv: ["rm", "-rf", "build"], cwd: "/proj", toolCallId: "tc" });
  assert.equal(r.allow, false, "真 risky + b 放行 + a 拒 ⇒ 拒（pm 非终审）");
  assert.equal(s.opCalls(), 1);
  assert.equal(audit.records[0].branch, "b-allow→a-deny");
});

test("集成：`sh -c \"…\"`（re-shell）门禁真判=deny → **终结拒，(b)/(a) 未被调用**", async () => {
  const rules = defaultShellRules();
  assert.equal(classifyShell(["sh", "-c", "rm -rf /"], rules), "deny");

  const s = spies('{"verdict":"allow"}', "allow"); // 桩本会放行——绝不谈得上被问
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: (argv, r) => classifyShell(argv, r),
    rules,
    rulesId: rules.id,
    audit,
    pmAsk: s.pm,
    operatorChannel: s.operator,
  });
  const r = await gate({ command: 'sh -c "rm -rf /"', argv: ["sh", "-c", "rm -rf /"], cwd: "/proj", toolCallId: "tc" });
  assert.equal(r.allow, false);
  assert.equal(s.pmCalls(), 0, "re-shell 仍硬拒——根本不到本层");
  assert.equal(s.opCalls(), 0);
  assert.equal(audit.records[0].branch, BRANCH_C_DENY);
});

test("集成：`ls -la` 门禁真判=allow → 放行，**不进 (b)/(a)**", async () => {
  const rules = defaultShellRules();
  assert.equal(classifyShell(["ls", "-la"], rules), "allow");

  const s = spies('{"verdict":"deny"}', "deny");
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: (argv, r) => classifyShell(argv, r),
    rules,
    rulesId: rules.id,
    audit,
    pmAsk: s.pm,
    operatorChannel: s.operator,
  });
  const r = await gate({ command: "ls -la", argv: ["ls", "-la"], cwd: "/proj", toolCallId: "tc" });
  assert.equal(r.allow, true);
  assert.equal(s.pmCalls(), 0);
  assert.equal(s.opCalls(), 0);
  assert.equal(audit.records[0].branch, BRANCH_C_ALLOW);
});
