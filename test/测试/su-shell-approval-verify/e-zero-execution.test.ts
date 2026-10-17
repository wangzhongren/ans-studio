// test/测试/su-shell-approval-verify/e-zero-execution.test.ts
// 测试角色：su 命令审批策略——**真实 gate + 真实 run_shell 工具** 的零执行哨兵（2026-10-17）。
//
// 覆盖 PM 评审 §5.2「安全端到端（临时目录）」：
//   · deny（真实规则 `node -e`）批准 → 真实执行并产生哨兵；拒绝/超时/不可用 → **哨兵不存在**；
//   · risky（测试分类器）批准/拒绝 → 同上；
//   · review（不存在的程序）批准 → 判定已放行但 spawn 失败（如实失败，不假成功）；
//   · 审计逐条落 sink，command 原文。
//
// 纪律：**不跑破坏性命令**——只用 `process.execPath -e` 在临时目录写一个哨兵文件；无 sh -c/rm。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import { classifyShell, defaultShellRules } from "../../../src/service/gate/shell-rules.ts";
import { createShellGate, type ClassifyShellFn } from "../../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../../src/common/编排/shell-audit.ts";
import type { OperatorChannelFn, OperatorOutcome, OperatorPrompt, ShellGate, WriteGate } from "../../../src/model/runtime.ts";
import { makeTempProject, operatorStub } from "./fixture.ts";

const allowWrite: WriteGate = () => ({
  allowed: true,
  matchedEntry: { root: "project", path: "sentinel-root", kind: "file", purpose: "独立验证夹具（run_shell 不写文件）" },
});

function sentinelCommand(sentinel: string): string {
  // argv-noshell 解析器按 shell 引号规则切分：单引号包住 node 代码，内部双引号原样保留。
  const code = `require("fs").writeFileSync("${sentinel}", "executed")`;
  return `${process.execPath} -e '${code}'`;
}

function makeGate(opts: {
  classifyShell?: ClassifyShellFn;
  operator: OperatorChannelFn;
  operatorTimeoutMs?: number;
}) {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: opts.classifyShell ?? classifyShell,
    rules: defaultShellRules(),
    rulesId: "default",
    audit,
    operatorOnly: true,
    approveDeny: true,
    operatorChannel: opts.operator,
    ...(opts.operatorTimeoutMs !== undefined ? { operatorTimeoutMs: opts.operatorTimeoutMs } : {}),
  });
  return { gate, audit };
}

function runShell(gate: ShellGate, cwd: string) {
  const tool = buildGovernedTools(allowWrite, { shellGate: gate, shellCwd: cwd }).find(
    (t) => t.name === "run_shell",
  );
  assert.ok(tool, "run_shell 必须已注册");
  return tool!;
}

const DENY_CMD = sentinelCommand("sentinel-deny.txt");
const RISKY_CMD = sentinelCommand("sentinel-risky.txt");

test("E1 deny（真实规则 node -e）：批准 → 真实执行并产生哨兵；审计结论 allow", async () => {
  const fx = makeTempProject();
  try {
    const prompts: OperatorPrompt[] = [];
    const { gate, audit } = makeGate({ operator: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts) });
    const tool = runShell(gate, fx.root);
    const res = await tool.handler({ name: "run_shell", args: { command: DENY_CMD }, toolCallId: "e1" });
    assert.equal(prompts.length, 1, "deny 档必须出 1 卡");
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(fs.existsSync(path.join(fx.root, "sentinel-deny.txt")), true, "批准后必须真实执行");
    assert.equal(audit.records.length, 1);
    assert.equal(audit.records[0].conclusion, "allow");
    assert.equal(audit.records[0].branch, "c-deny→a-allow");
    assert.equal(audit.records[0].command, DENY_CMD, "审计 command 原文");
  } finally {
    fx.cleanup();
  }
});

const NO_EXEC_ARMS: { name: string; outcome: OperatorOutcome | (() => Promise<OperatorOutcome>); branch: string }[] = [
  { name: "拒绝", outcome: { outcome: "deny", operatorId: "客户", reason: "不同意" }, branch: "c-deny→a-deny" },
  { name: "不可用", outcome: { outcome: "unavailable", reason: "无人值守" }, branch: "c-deny→a-unavailable" },
];

for (const arm of NO_EXEC_ARMS) {
  test(`E2 deny × ${arm.name}：零执行（哨兵不存在）；审计 branch=${arm.branch}`, async () => {
    const fx = makeTempProject();
    try {
      const prompts: OperatorPrompt[] = [];
      const { gate, audit } = makeGate({ operator: operatorStub(arm.outcome, prompts) });
      const tool = runShell(gate, fx.root);
      const res = await tool.handler({ name: "run_shell", args: { command: DENY_CMD }, toolCallId: "e2" });
      assert.equal(prompts.length, 1);
      assert.equal(res.ok, false);
      assert.equal(fs.existsSync(path.join(fx.root, "sentinel-deny.txt")), false, "未批准不得执行");
      assert.equal(audit.records[0].branch, arm.branch);
      assert.equal(audit.records[0].conclusion, "deny");
    } finally {
      fx.cleanup();
    }
  });
}

test("E2b deny × 超时：零执行（哨兵不存在）；审计 branch=c-deny→a-timeout", async () => {
  const fx = makeTempProject();
  try {
    const prompts: OperatorPrompt[] = [];
    const { gate, audit } = makeGate({
      operator: (prompt) => {
        prompts.push(prompt);
        return new Promise<OperatorOutcome>(() => {});
      },
      operatorTimeoutMs: 30,
    });
    const tool = runShell(gate, fx.root);
    const res = await tool.handler({ name: "run_shell", args: { command: DENY_CMD }, toolCallId: "e2b" });
    assert.equal(prompts.length, 1);
    assert.equal(res.ok, false);
    assert.equal(fs.existsSync(path.join(fx.root, "sentinel-deny.txt")), false);
    assert.equal(audit.records[0].branch, "c-deny→a-timeout");
  } finally {
    fx.cleanup();
  }
});

test("E3 risky（测试分类器）：批准 → 执行；拒绝 → 零执行；branch 对应", async () => {
  const riskyClassifier: ClassifyShellFn = () => ({ decision: "risky", ruleId: "risky:fixture" });

  const approved = makeTempProject();
  try {
    const prompts: OperatorPrompt[] = [];
    const { gate, audit } = makeGate({
      classifyShell: riskyClassifier,
      operator: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts),
    });
    const res = await runShell(gate, approved.root).handler({
      name: "run_shell",
      args: { command: RISKY_CMD },
      toolCallId: "e3a",
    });
    assert.equal(res.ok, true);
    assert.equal(fs.existsSync(path.join(approved.root, "sentinel-risky.txt")), true);
    assert.equal(audit.records[0].branch, "c-risky→a-allow");
  } finally {
    approved.cleanup();
  }

  const denied = makeTempProject();
  try {
    const { gate, audit } = makeGate({
      classifyShell: riskyClassifier,
      operator: operatorStub({ outcome: "deny", operatorId: "客户", reason: "不同意" }),
    });
    const res = await runShell(gate, denied.root).handler({
      name: "run_shell",
      args: { command: RISKY_CMD },
      toolCallId: "e3b",
    });
    assert.equal(res.ok, false);
    assert.equal(fs.existsSync(path.join(denied.root, "sentinel-risky.txt")), false);
    assert.equal(audit.records[0].branch, "c-risky→a-deny");
  } finally {
    denied.cleanup();
  }
});

test("E4 review（不存在的程序）：批准 → 判定已放行但 spawn 失败如实（不假成功）", async () => {
  const fx = makeTempProject();
  try {
    const prompts: OperatorPrompt[] = [];
    const { gate, audit } = makeGate({ operator: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts) });
    const res = await runShell(gate, fx.root).handler({
      name: "run_shell",
      args: { command: "ans-no-such-executable-for-su-approval-verify" },
      toolCallId: "e4",
    });
    assert.equal(prompts.length, 1, "review 档必须出 1 卡（即便命令不存在）");
    assert.equal(res.ok, false, "spawn 失败必须如实失败");
    assert.ok(res.execution?.error, "必须带真实执行错误");
    assert.equal(audit.records[0].conclusion, "allow", "判定已放行（审计如实）");
    assert.equal(audit.records[0].branch, "c-review→a-allow");
  } finally {
    fx.cleanup();
  }
});
