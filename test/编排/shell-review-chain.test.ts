// test/编排/shell-review-chain.test.ts
// 编排角色自测：shell 审核链**三层 (c)→(b)→(a)**（设计 §7.3 顺序、§7.5 fail-closed、§7.6 留痕）。
// 只依赖本角色文件（common/编排/、pipeline/orchestration/pm-reviewer.ts）——不依赖真实模型、不触网络。
//
// 覆盖（任务清单逐条）：
//   1. (c) 白名单 → 放行，**不经 (b)/(a)**（注入桩断言未被调用）；
//   2. (c) 硬拒   → 拒绝，**(b)/(a) 未被调用**（证明不可翻案——桩本会放行也拦不住 c 的终结）；
//   3. (c) review → 进 (b)；(b) 放行 → 放行；(b) 拒绝 → 拒绝；
//   4. (b) 拿不准/超时/无会话/JSON 非法/报错 → **升级到 (a)**；
//   5. (a) 放行 → 放行；(a) 拒绝/不可用/超时/未接 → **拒绝**；
//   6. 审计含 `by` 与 `branch`，且**每层分支可辨识**（升级链 `b-…→a-…`）；
//   附加：`parsePmVerdict`、CLI 操作者通道、`createPmReviewer`（注入 openSession 桩，无真实模型）。

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { SessionEvent } from "../../src/provider/pi/session.ts";
import {
  createShellGate,
  parsePmVerdict,
  escalateBranch,
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
  BRANCH_B_ALLOW,
  BRANCH_B_DENY,
  BRANCH_B_UNSURE,
  BRANCH_B_UNAVAILABLE,
  BRANCH_B_TIMEOUT,
  BRANCH_B_BADJSON,
  BRANCH_A_ALLOW,
  BRANCH_A_DENY,
  BRANCH_A_UNAVAILABLE,
  BRANCH_A_TIMEOUT,
  type PmAskFn,
  type OperatorChannelFn,
  type ShellRules,
} from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import { createCliOperatorChannel } from "../../src/common/编排/operator-channel.ts";
import {
  createPmReviewer,
  defaultExtractReply,
  buildPmReviewPrompt,
} from "../../src/pipeline/orchestration/pm-reviewer.ts";

const RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };
const RULES_ID = "test-ruleset";
// 一条 (c) 判为 review 的命令（未在白名单、也未被硬拒）。
const REQ = { command: "sed s/a/b/ f", argv: ["sed", "s/a/b/", "f"], cwd: "/proj", toolCallId: "call-1" };

interface Spies {
  pm: PmAskFn;
  operator: OperatorChannelFn;
  pmCalls: () => number;
  operatorCalls: () => number;
}

/** 造一对会被计数的 (b)/(a) 桩；默认两处都「若被问就放行」。 */
function spies(pmReply = '{"verdict":"allow"}', opOutcome: "allow" | "deny" = "allow"): Spies {
  let pmCalls = 0;
  let operatorCalls = 0;
  const pm: PmAskFn = () => {
    pmCalls += 1;
    return pmReply;
  };
  const operator: OperatorChannelFn = () => {
    operatorCalls += 1;
    return { outcome: opOutcome, operatorId: "tester" };
  };
  return { pm, operator, pmCalls: () => pmCalls, operatorCalls: () => operatorCalls };
}

// —————————————————————— 1. (c) 白名单 → 放行，不经 (b)/(a) ——————————————————————

test("(c) 白名单 → 放行，且**不经 (b)/(a)**（桩未被调用）", async () => {
  const audit = createMemoryAuditSink();
  const s = spies('{"verdict":"deny"}', "deny"); // 即便 (b)/(a) 会拒，也不该被问到
  const gate = createShellGate({
    classifyShell: () => "allow",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: s.pm,
    operatorChannel: s.operator,
  });
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  if (!r.allow) return;
  assert.equal(r.by, "ruleset:test-ruleset");
  assert.equal(s.pmCalls(), 0, "(c) 白名单放行不得进入 (b)");
  assert.equal(s.operatorCalls(), 0, "(c) 白名单放行不得进入 (a)");
  assert.equal(audit.records[0].branch, BRANCH_C_ALLOW);
  assert.equal(audit.records[0].conclusion, "allow");
});

// —————————————————————— 2. (c) 硬拒 → 拒绝，(b)/(a) 未被调用（不可翻案） ——————————————————————

test("(c) 硬拒 → 拒绝、终结，**(b)/(a) 未被调用**（硬地板不可被翻案）", async () => {
  const audit = createMemoryAuditSink();
  const s = spies('{"verdict":"allow"}', "allow"); // 桩本会放行——但绝不该被问到
  const gate = createShellGate({
    classifyShell: () => ({ decision: "deny", ruleId: "rm-rf", reason: "命中 rm 硬拒" }),
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: s.pm,
    operatorChannel: s.operator,
  });
  const r = await gate(REQ);
  // 关键：结果必须是拒绝——(b)/(a) 即便会放行，也无法翻 (c) 的硬拒。
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.equal(r.by, "ruleset:rm-rf");
  assert.equal(s.pmCalls(), 0, "硬拒不得进入 (b)（不可翻案）");
  assert.equal(s.operatorCalls(), 0, "硬拒不得进入 (a)（不可翻案）");
  assert.equal(audit.records[0].branch, BRANCH_C_DENY);
  assert.equal(audit.records[0].conclusion, "deny");
});

// —————————————————————— 3. (c) review → (b) ——————————————————————

test("(c) review → 进 (b)；(b) 放行 → 放行（审计 b-allow，by 记 pm 会话/模型）", async () => {
  const audit = createMemoryAuditSink();
  let aCalls = 0;
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => JSON.stringify({ verdict: "allow", sessionId: "pm-1", model: "m1" }),
    operatorChannel: () => {
      aCalls += 1;
      return { outcome: "deny" };
    },
  });
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  if (!r.allow) return;
  assert.equal(r.by, "pm:pm-1(m1)");
  assert.equal(aCalls, 0, "(b) 明确放行即终结，不该叫人");
  assert.equal(audit.records[0].branch, BRANCH_B_ALLOW);
  assert.equal(audit.records[0].conclusion, "allow");
});

test("(c) review → (b) 拒绝 → 拒绝（审计 b-deny）", async () => {
  const audit = createMemoryAuditSink();
  let aCalls = 0;
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => '{"verdict":"deny","reason":"该命令会写盘"}',
    operatorChannel: () => {
      aCalls += 1;
      return { outcome: "allow" };
    },
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.match(r.reason, /写盘/);
  assert.equal(aCalls, 0, "(b) 明确拒绝即终结，不该叫人");
  assert.equal(audit.records[0].branch, BRANCH_B_DENY);
});

// —————————————————————— 4. (b) 拿不准/超时/无会话/JSON 非法/报错 → 升级到 (a) ——————————————————————

test("(b) 拿不准 → 升级 (a) → (a) 放行 = 放行（升级链 b-unsure→a-allow 可辨识）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => '{"verdict":"unsure","sessionId":"pm-1","model":"m1"}',
    operatorChannel: () => ({ outcome: "allow", operatorId: "alice" }),
  });
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  if (!r.allow) return;
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNSURE, BRANCH_A_ALLOW));
  assert.equal(audit.records[0].branch, "b-unsure→a-allow");
  assert.equal(r.by, "pm:pm-1(m1) → operator:alice");
});

test("(b) 审读超时 → 升级 (a)（分支 b-timeout→…；绝不视为放行）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => new Promise<string>(() => {}), // 永不返回
    pmTimeoutMs: 20,
    timeoutMs: 5000,
    operatorChannel: () => ({ outcome: "deny", operatorId: "bob" }),
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_TIMEOUT, BRANCH_A_DENY));
  assert.equal(audit.records[0].branch, "b-timeout→a-deny");
});

test("(b) 无 pm 会话（未注入 pmAsk）→ 升级 (a)（分支 b-unavailable→…）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    // 不注入 pmAsk —— (b) 无会话
    operatorChannel: () => ({ outcome: "allow", operatorId: "bob" }),
  });
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNAVAILABLE, BRANCH_A_ALLOW));
  assert.equal(audit.records[0].branch, "b-unavailable→a-allow");
});

test("(b) 判定 JSON 不合法 → 升级 (a)（分支 b-badjson→…）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => "我觉得可以吧（这不是 JSON）",
    operatorChannel: () => ({ outcome: "deny", operatorId: "bob" }),
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_BADJSON, BRANCH_A_DENY));
});

test("(b) 报错（会话打不开）→ 升级 (a)（分支 b-unavailable→…）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => {
      throw new Error("无法开启 pm 会话");
    },
    operatorChannel: () => ({ outcome: "allow", operatorId: "bob" }),
  });
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNAVAILABLE, BRANCH_A_ALLOW));
});

// —————————————————————— 5. (a) 放行/拒绝/不可用/超时/未接 ——————————————————————

test("(a) 拒绝 → 拒绝（分支 b-unsure→a-deny）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => '{"verdict":"unsure"}',
    operatorChannel: () => ({ outcome: "deny", operatorId: "carol", reason: "看着危险" }),
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.match(r.reason, /看着危险/);
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNSURE, BRANCH_A_DENY));
});

test("(a) 通道不可用（无人值守）→ 拒绝", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => '{"verdict":"unsure"}',
    operatorChannel: () => ({ outcome: "unavailable", reason: "无 TTY" }),
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.match(r.reason, /不可用/);
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNSURE, BRANCH_A_UNAVAILABLE));
});

test("(a) 确认超时 → 拒绝（分支 b-unsure→a-timeout）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => '{"verdict":"unsure"}',
    operatorChannel: () => new Promise(() => {}), // 人永不回答
    operatorTimeoutMs: 20,
    timeoutMs: 5000,
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNSURE, BRANCH_A_TIMEOUT));
  assert.equal(audit.records[0].branch, "b-unsure→a-timeout");
});

test("(a) 通道未接入（注入了 (b) 但无 (a)）→ 拒绝（绝不视为放行）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => '{"verdict":"unsure"}',
    // 不注入 operatorChannel
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(audit.records[0].branch, escalateBranch(BRANCH_B_UNSURE, BRANCH_A_UNAVAILABLE));
});

// —————————————————————— 6. 审计 by/branch 逐层可辨识 ——————————————————————

test("审计记录含 by 与 branch，且每层分支可辨识（c→b→a 逐层分别核对）", async () => {
  const audit = createMemoryAuditSink();
  // c-allow
  await createShellGate({ classifyShell: () => "allow", rules: RULES, rulesId: RULES_ID, audit })(REQ);
  // c-deny
  await createShellGate({
    classifyShell: () => ({ decision: "deny", ruleId: "x", reason: "r" }),
    rules: RULES,
    rulesId: RULES_ID,
    audit,
  })(REQ);
  // b-allow
  await createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => '{"verdict":"allow","sessionId":"s","model":"m"}',
  })(REQ);
  // a-allow（经 b-unsure 升级）
  await createShellGate({
    classifyShell: () => "review",
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    pmAsk: () => '{"verdict":"unsure"}',
    operatorChannel: () => ({ outcome: "allow", operatorId: "op-7" }),
  })(REQ);

  assert.equal(audit.records.length, 4);
  assert.equal(audit.records[0].branch, BRANCH_C_ALLOW);
  assert.match(audit.records[0].by, /^ruleset:/);
  assert.equal(audit.records[1].branch, BRANCH_C_DENY);
  assert.equal(audit.records[2].branch, BRANCH_B_ALLOW);
  assert.match(audit.records[2].by, /^pm:s\(m\)$/);
  assert.equal(audit.records[3].branch, "b-unsure→a-allow");
  assert.match(audit.records[3].by, /operator:op-7$/);
  // 每条都带命令原文与时间戳、执行前状态。
  for (const rec of audit.records) {
    assert.equal(rec.command, REQ.command);
    assert.equal(rec.execution, "未执行");
    assert.ok(typeof rec.timestamp === "string");
  }
});

// —————————————————————— 附加：parsePmVerdict ——————————————————————

test("parsePmVerdict：合法/围栏/夹带文字/非法/缺字段/null 的解析", () => {
  assert.deepEqual(parsePmVerdict('{"verdict":"allow"}'), { verdict: "allow" });
  assert.deepEqual(parsePmVerdict('{"verdict":"deny","reason":"x"}'), { verdict: "deny", reason: "x" });
  assert.deepEqual(parsePmVerdict("```json\n{\"verdict\":\"unsure\"}\n```"), { verdict: "unsure" });
  assert.deepEqual(parsePmVerdict('我的判断：{"verdict":"unsure"} 谢谢'), { verdict: "unsure" });
  assert.deepEqual(parsePmVerdict('{"verdict":"allow","sessionId":"s","model":"m"}'), {
    verdict: "allow",
    sessionId: "s",
    model: "m",
  });
  // 全部不确定 → undefined（升级到 (a)）
  assert.equal(parsePmVerdict("完全不是 JSON"), undefined);
  assert.equal(parsePmVerdict('{"verdict":"maybe"}'), undefined);
  assert.equal(parsePmVerdict('{"reason":"缺 verdict"}'), undefined);
  assert.equal(parsePmVerdict(""), undefined);
  assert.equal(parsePmVerdict(null), undefined);
  assert.equal(parsePmVerdict(undefined), undefined);
  assert.equal(parsePmVerdict(42), undefined);
});

// —————————————————————— 附加：CLI 操作者通道（注入 I/O） ——————————————————————

test("createCliOperatorChannel：y→放行、n→拒绝、空/未识别→拒绝、EOF→不可用", async () => {
  const mk = (line: string | null) => {
    const writes: string[] = [];
    const ch = createCliOperatorChannel({
      write: (t) => writes.push(t),
      readLine: async () => line,
      operatorId: "cli-op",
    });
    return { ch, writes };
  };
  const prompt = { command: "sed s/a/b/ f", argv: ["sed", "s/a/b/", "f"], cwd: "/p", toolCallId: "t", reason: "pm 拿不准" };

  const yes = mk("y");
  assert.deepEqual(await yes.ch(prompt), { outcome: "allow", operatorId: "cli-op" });
  assert.match(yes.writes.join(""), /命令原文：/);
  assert.match(yes.writes.join(""), /pm 拿不准/);

  assert.deepEqual(await mk("n").ch(prompt), {
    outcome: "deny",
    operatorId: "cli-op",
    reason: "操作者选择拒绝（输入：n）",
  });

  const empty = await mk("").ch(prompt);
  assert.equal(empty.outcome, "deny");

  const weird = await mk("嗯？").ch(prompt);
  assert.equal(weird.outcome, "deny");

  const eof = await mk(null).ch(prompt);
  assert.equal(eof.outcome, "unavailable");
});

// —————————————————————— 附加：createPmReviewer（注入 openSession，无真实模型） ——————————————————————

const FAQ_PROJECT: ProjectConfig = { projectRoot: "/p", skillRoot: "/s", roles: {} };

function fakeHandle(reply: string): {
  open: (i: unknown, d: unknown) => Promise<import("../../src/pipeline/orchestration/run-role.ts").RoleSessionHandle>;
  isDisposed: () => boolean;
  sentText: () => string;
} {
  let disposed = false;
  let sent = "";
  const events: SessionEvent[] = [
    { kind: "message", summary: "用户指令：请审核" },
    { kind: "message", summary: reply },
    { kind: "settled", summary: "会话结束" },
  ];
  return {
    isDisposed: () => disposed,
    sentText: () => sent,
    async open() {
      return {
        async send(text: string) {
          sent = text;
        },
        events(): AsyncIterable<SessionEvent> {
          return (async function* () {
            for (const e of events) yield e;
          })();
        },
        async dispose() {
          disposed = true;
        },
      };
    },
  };
}

test("createPmReviewer：注入 openSession 桩 → 返回 pm 回复原文、发审核提示、收口 dispose", async () => {
  const f = fakeHandle('{"verdict":"allow","sessionId":"pm-x","model":"m-x"}');
  const ask = createPmReviewer({
    project: FAQ_PROJECT,
    sessionDeps: { createAdapter: () => ({}) as never },
    openSession: f.open as never,
  });
  const raw = await ask({ command: "sed s/a/b/ f", argv: ["sed", "s/a/b/", "f"], cwd: "/p", toolCallId: "t-9" });
  assert.equal(raw, '{"verdict":"allow","sessionId":"pm-x","model":"m-x"}');
  assert.ok(f.isDisposed(), "会话必须收口（dispose）");
  assert.match(f.sentText(), /命令原文/);
  assert.match(f.sentText(), /sed s\/a\/b\/ f/);
});

test("createPmReviewer：openSession 抛错 → 透传抛错（由 shell-gate 判 (b) 不可用 → 升级到 (a)）", async () => {
  const ask = createPmReviewer({
    project: FAQ_PROJECT,
    sessionDeps: { createAdapter: () => ({}) as never },
    openSession: (async () => {
      throw new Error("pm 会话打不开");
    }) as never,
  });
  await assert.rejects(
    ask({ command: "ls", argv: ["ls"], cwd: "/p", toolCallId: "t" }),
    /pm 会话打不开/,
  );
});

test("defaultExtractReply：取最后一条 message（跳过「用户指令：」回显）；无 message → 空串", () => {
  const events: SessionEvent[] = [
    { kind: "message", summary: "用户指令：x" },
    { kind: "tool_call", summary: "t" },
    { kind: "message", summary: '{"verdict":"deny"}' },
    { kind: "settled", summary: "end" },
  ];
  assert.equal(defaultExtractReply(events), '{"verdict":"deny"}');
  assert.equal(defaultExtractReply([{ kind: "settled", summary: "end" }]), "");
  // 提示文案含命令原文（逐字）
  assert.match(buildPmReviewPrompt({ command: "rm -rf /", argv: ["rm", "-rf", "/"], cwd: "/p", toolCallId: "t" }), /rm -rf \//);
});
