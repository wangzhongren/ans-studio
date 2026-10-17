// test/测试/su-shell-approval-verify/a-gate-policy.test.ts
// 测试角色：su 命令审批策略——**闸层判定**独立验证（2026-10-17）。
//
// 覆盖 PM 评审 §5.1：
//   · allow：0 次 operator、allowed、branch c-allow、by 含「（su 审批档）」；审计字段齐备；
//   · risky/review/deny（approveDeny=true）：各恰 1 次请求；批准→allowed；拒绝/超时/不可用→deny；
//     branch 对应 c-<tier>→a-*；拒绝/超时/不可用可辨；
//   · deny 无 approveDeny → 硬拒 c-deny 且 0 次请求；
//   · 构造守卫四组（互斥 / approveDeny 无 operatorOnly / 无通道 / 带 pmAsk 或 routineShellPolicy）；
//   · `renderSuApprovalReason` 金文本（前缀 + 写边界风险披露）。
//
// 独立构造：桩 operator/分类器 + 内存审计 sink；不跑任何真实命令。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
  createShellGate,
  renderSuApprovalReason,
  SU_APPROVAL_REASON_PREFIX,
  type ClassifyShellFn,
  type ShellClass,
  type ShellRules,
} from "../../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../../src/common/编排/shell-audit.ts";
import type { OperatorChannelFn, OperatorOutcome, OperatorPrompt } from "../../../src/model/runtime.ts";
import { EMPTY_RULES, classifier, hangingOperator, operatorStub } from "./fixture.ts";

function gateWith(opts: {
  decision: ShellClass;
  operator: OperatorChannelFn;
  approveDeny?: boolean;
  operatorTimeoutMs?: number;
  rules?: ShellRules | (() => ShellRules | Promise<ShellRules>);
}) {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: classifier(opts.decision, `test:${opts.decision}`),
    rules: opts.rules ?? EMPTY_RULES,
    rulesId: "verify",
    audit,
    operatorOnly: true,
    approveDeny: opts.approveDeny ?? true,
    operatorChannel: opts.operator,
    ...(opts.operatorTimeoutMs !== undefined ? { operatorTimeoutMs: opts.operatorTimeoutMs } : {}),
  });
  return { gate, audit };
}

const REQ = { command: "rm -rf build", argv: ["rm", "-rf", "build"], cwd: "/proj", toolCallId: "call-1" };

test("A1 allow：直接放行、operator 0 次、branch c-allow、by 含（su 审批档）；审计字段齐备", async () => {
  const prompts: OperatorPrompt[] = [];
  const { gate, audit } = gateWith({
    decision: "allow",
    operator: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts),
  });

  const r = await gate({ command: "ls -la", argv: ["ls", "-la"], cwd: "/proj", toolCallId: "c1" });
  assert.equal(r.allow, true);
  assert.equal(prompts.length, 0, "allow 必须 0 卡");
  if (r.allow) {
    assert.equal(r.by, "ruleset:test:allow（su 审批档）");
    assert.equal(r.by.includes("su 只读档"), false, "不得复用只读档后缀");
  }
  const rec = audit.records[0];
  assert.equal(rec.conclusion, "allow");
  assert.equal(rec.branch, BRANCH_C_ALLOW);
  assert.equal(rec.command, "ls -la");
  assert.deepEqual(rec.argv, ["ls", "-la"]);
  assert.equal(rec.cwd, "/proj");
  assert.equal(rec.by, "ruleset:test:allow（su 审批档）");
  assert.deepEqual(rec.conditions, ["shell-gate"]);
  assert.equal(rec.execution, "未执行");
});

const A_OUTCOMES: { name: string; outcome: OperatorOutcome | (() => Promise<OperatorOutcome>); branchSuffix: string; allowed: boolean }[] = [
  { name: "批准", outcome: { outcome: "allow", operatorId: "客户A" }, branchSuffix: "a-allow", allowed: true },
  { name: "拒绝", outcome: { outcome: "deny", operatorId: "客户A", reason: "不同意" }, branchSuffix: "a-deny", allowed: false },
  { name: "不可用", outcome: { outcome: "unavailable", reason: "无人值守" }, branchSuffix: "a-unavailable", allowed: false },
];

for (const tier of ["risky", "review", "deny"] as const) {
  for (const arm of A_OUTCOMES) {
    test(`A2 ${tier} × ${arm.name}：恰 1 次请求；branch c-${tier}→${arm.branchSuffix}；allow=${arm.allowed}`, async () => {
      const prompts: OperatorPrompt[] = [];
      const { gate, audit } = gateWith({
        decision: tier,
        operator: operatorStub(arm.outcome, prompts),
      });
      const r = await gate({ ...REQ, toolCallId: `${tier}-${arm.branchSuffix}` });
      assert.equal(prompts.length, 1, "risky/review/deny 必须恰出 1 卡");
      assert.equal(r.allow, arm.allowed);
      const rec = audit.records[0];
      assert.equal(rec.branch, `c-${tier}→${arm.branchSuffix}`);
      assert.equal(rec.conclusion, arm.allowed ? "allow" : "deny");
      assert.equal(rec.command, REQ.command, "审计 command 原文");
      assert.deepEqual(rec.argv, REQ.argv);
      assert.equal(rec.cwd, "/proj");
      assert.ok(rec.by.includes(`${SU_APPROVAL_REASON_PREFIX}[`) === false, "by 不应混入 reason 前缀");
      assert.ok(rec.by.includes("（su 审批档）"), "by 带档位后缀");
      if (arm.allowed) assert.ok(rec.by.includes("operator:客户A"), "批准后 by 含 operator:<id>");
      else assert.ok(rec.by.includes("operator:") || rec.by.includes("operator:不可用"), "拒绝/不可用 by 可辨");
    });
  }

  test(`A3 ${tier} × 超时：恰 1 次请求；branch c-${tier}→a-timeout；deny`, async () => {
    const prompts: OperatorPrompt[] = [];
    const { gate, audit } = gateWith({
      decision: tier,
      operator: hangingOperator(prompts),
      operatorTimeoutMs: 30,
    });
    const r = await gate({ ...REQ, toolCallId: `${tier}-timeout` });
    assert.equal(prompts.length, 1);
    assert.equal(r.allow, false);
    if (!r.allow) assert.match(r.reason, /超时/);
    assert.equal(audit.records[0].branch, `c-${tier}→a-timeout`);
    assert.equal(audit.records[0].conclusion, "deny");
  });
}

test("A4 deny + approveDeny=false：既有硬拒 c-deny，0 次请求（回归）", async () => {
  const prompts: OperatorPrompt[] = [];
  const { gate, audit } = gateWith({
    decision: "deny",
    approveDeny: false,
    operator: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts),
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(prompts.length, 0, "approveDeny=false 时 deny 不得出卡");
  assert.equal(audit.records[0].branch, BRANCH_C_DENY);
  assert.equal(audit.records[0].conclusion, "deny");
});

test("A5 构造守卫四组：互斥 / approveDeny 无 operatorOnly / 无通道 / 带 pmAsk 或 routineShellPolicy", () => {
  const base = {
    classifyShell: classifier("allow"),
    rules: EMPTY_RULES,
    audit: createMemoryAuditSink(),
    operatorChannel: operatorStub({ outcome: "deny" }),
  };

  assert.throws(() => createShellGate({ ...base, readonlyOnly: true, operatorOnly: true }), /互斥/);
  assert.throws(() => createShellGate({ ...base, approveDeny: true }), /approveDeny/);
  assert.throws(
    () => createShellGate({ ...base, operatorChannel: undefined, operatorOnly: true }),
    /operatorChannel/,
  );
  assert.throws(
    () => createShellGate({ ...base, operatorOnly: true, pmAsk: async () => ({}) as never }),
    /pmAsk/,
  );
  assert.throws(
    () =>
      createShellGate({
        ...base,
        operatorOnly: true,
        routineShellPolicy: { projectRoot: "/p", routineChecks: [] } as never,
      }),
    /routineShellPolicy/,
  );
});

test("A6 规则集加载失败 / 分类器抛错：fail-closed 且有稳定 branch（非审批放行）", async () => {
  const audit = createMemoryAuditSink();
  const brokenRules = createShellGate({
    classifyShell: classifier("allow"),
    rules: () => {
      throw new Error("rules broken");
    },
    audit,
    operatorOnly: true,
    approveDeny: true,
    operatorChannel: operatorStub({ outcome: "allow", operatorId: "客户" }),
  });
  const r1 = await brokenRules(REQ);
  assert.equal(r1.allow, false);
  assert.equal(audit.records[0].branch, "ruleset-load-failed");
  assert.equal(audit.records[0].conclusion, "error");

  const audit2 = createMemoryAuditSink();
  const throwing: ClassifyShellFn = () => {
    throw new Error("classify broken");
  };
  const g2 = createShellGate({
    classifyShell: throwing,
    rules: EMPTY_RULES,
    audit: audit2,
    operatorOnly: true,
    approveDeny: true,
    operatorChannel: operatorStub({ outcome: "allow", operatorId: "客户" }),
  });
  const r2 = await g2(REQ);
  assert.equal(r2.allow, false);
  assert.equal(audit2.records[0].branch, "classify-error");
});

test("A8 旧只读档回归：allow 直放；risky/review → readonly-deny、deny → 既有硬拒 c-deny；0 次 operator", async () => {
  for (const decision of ["risky", "review", "deny"] as const) {
    const audit = createMemoryAuditSink();
    const prompts: OperatorPrompt[] = [];
    const gate = createShellGate({
      classifyShell: classifier(decision, `test:${decision}`),
      rules: EMPTY_RULES,
      audit,
      readonlyOnly: true,
      operatorChannel: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts),
    });
    const r = await gate(REQ);
    assert.equal(r.allow, false, `${decision} 在只读档必须拒绝`);
    assert.equal(prompts.length, 0, "只读档不得弹卡");
    assert.equal(
      audit.records[0].branch,
      decision === "deny" ? "c-deny" : "readonly-deny",
      "deny 维持既有硬拒；risky/review 走 readonly-deny",
    );
    assert.equal(audit.records[0].by, `ruleset:test:${decision}（su 只读档）`);
  }
});

test("A7 renderSuApprovalReason：前缀/档位 token/写边界风险披露为固定文本；detail 逐字进入", () => {
  for (const tier of ["risky", "review", "deny"] as const) {
    const text = renderSuApprovalReason(tier, "命中硬拒程序规则：reshell");
    assert.ok(text.startsWith(`${SU_APPROVAL_REASON_PREFIX}[${tier}]：`));
    assert.ok(text.includes("命中硬拒程序规则：reshell"));
    assert.ok(text.includes("批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界"));
    assert.equal(text.includes("项目角色不受影响"), false);
  }
  const fallback = renderSuApprovalReason("deny");
  assert.ok(fallback.includes("(c) 判为 deny"));
});
