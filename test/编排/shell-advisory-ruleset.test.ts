// test/编排/shell-advisory-ruleset.test.ts
// 2026-10-18 客户新裁定：第一层 (c) 规则不拒绝任何请求，只快速放行；所有拒绝由 (a)（判断 agent/操作者）做出。
// 覆盖：allow 0 卡；deny/risky/review 跳过 (b) 直接交 (a)（allow/deny 两向）；规则原因进 prompt；
// 构造守卫（互斥/必须有通道）；旧 advisoryRuleset=false 的 c-deny 硬拒回归；assembleProjectShellGate 默认 advisory。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { ShellClass } from "../../src/model/decision.ts";
import type {
  OperatorChannelFn,
  OperatorOutcome,
  OperatorPrompt,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";
import {
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
  BRANCH_C_REVIEW,
  BRANCH_C_RISKY,
  createShellGate,
  type ClassifyShellFn,
  type ShellRules,
} from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink, type ShellAuditRecord } from "../../src/common/编排/shell-audit.ts";
import { assembleProjectShellGate } from "../../src/pipeline/orchestration/shell-arming.ts";
import { classifyShell, defaultShellRules } from "../../src/common/门禁引擎/classify-shell.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";

const RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };
const REQ = { command: "rm -rf build", argv: ["rm", "-rf", "build"], cwd: "/proj", toolCallId: "call-1" };

function classifier(decision: ShellClass, ruleId: string, reason?: string): ClassifyShellFn {
  return () => ({ decision, ruleId, ...(reason !== undefined ? { reason } : {}) });
}

function operatorStub(
  outcome: OperatorOutcome,
  prompts: OperatorPrompt[],
): OperatorChannelFn {
  return (prompt) => {
    prompts.push(prompt);
    return outcome;
  };
}

function gateWith(opts: {
  decision: ShellClass;
  operator: OperatorOutcome;
  advisory?: boolean;
  pmAsk?: () => string;
}): { gate: ReturnType<typeof createShellGate>; prompts: OperatorPrompt[]; audit: ShellAuditRecord[] } {
  const prompts: OperatorPrompt[] = [];
  const sink = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: classifier(opts.decision, `rule:${opts.decision}`, `命中原因-${opts.decision}`),
    rules: RULES,
    rulesId: "test",
    audit: sink,
    operatorChannel: operatorStub(opts.operator, prompts),
    ...(opts.advisory !== undefined ? { advisoryRuleset: opts.advisory } : { advisoryRuleset: true }),
    ...(opts.pmAsk !== undefined ? { pmAsk: opts.pmAsk } : {}),
  });
  return { gate, prompts, audit: sink.records };
}

test("advisory：allow 直接放行、0 次 operator、branch c-allow", async () => {
  const { gate, prompts } = gateWith({ decision: "allow", operator: { outcome: "allow" } });
  const r = await gate(REQ);
  assert.equal(r.allow, true);
  assert.equal(prompts.length, 0, "allow 不得调用 operator");
  assert.match(r.allow ? r.by : "", /advisory 规则/);
});

test("advisory：deny → (a) allow（branch c-deny→a-allow；规则原因进 prompt）", async () => {
  const { gate, prompts, audit } = gateWith({
    decision: "deny",
    operator: { outcome: "allow", operatorId: "judge:claude" },
  });
  const r = await gate(REQ);
  assert.equal(r.allow, true, "第一层不得拒绝；由 (a) 放行");
  assert.equal(prompts.length, 1);
  assert.match(prompts[0]!.reason ?? "", /规则判为 deny/);
  assert.match(prompts[0]!.reason ?? "", /命中原因-deny/);
  assert.match(prompts[0]!.reason ?? "", /规则只作参考/);
  assert.equal(audit[0]?.branch, "c-deny→a-allow");
});

test("advisory：deny → (a) deny（branch c-deny→a-deny）", async () => {
  const { gate, audit } = gateWith({
    decision: "deny",
    operator: { outcome: "deny", operatorId: "judge:claude", reason: "判断 agent 拒绝" },
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(audit.at(-1)?.branch, "c-deny→a-deny");
});

test("advisory：risky/review 跳过 (b) 直接交 (a)", async () => {
  for (const [decision, expected] of [
    ["risky", `c-risky→a-allow`],
    ["review", `c-review→a-allow`],
  ] as const) {
    let pmCalls = 0;
    const { gate, prompts, audit } = gateWith({
      decision,
      operator: { outcome: "allow" },
      pmAsk: () => {
        pmCalls += 1;
        return "allow";
      },
    });
    const r = await gate(REQ);
    assert.equal(r.allow, true);
    assert.equal(pmCalls, 0, `${decision} 不得调用 (b)`);
    assert.equal(prompts.length, 1, `${decision} 应交 (a)`);
    assert.equal(audit.at(-1)?.branch, expected);
  }
});

test("advisory=false 旧路径：c-deny 终结硬拒、operator 0 次（回归）", async () => {
  const { gate, prompts, audit } = gateWith({
    decision: "deny",
    operator: { outcome: "allow" },
    advisory: false,
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(prompts.length, 0);
  assert.equal(audit.at(-1)?.branch, BRANCH_C_DENY);
});

test("advisory 构造守卫：与 readonly/operatorOnly 互斥；必须有 operatorChannel", () => {
  const base = {
    classifyShell: classifier("deny", "r"),
    rules: RULES,
    audit: createMemoryAuditSink(),
  };
  const op = operatorStub({ outcome: "allow" }, []);
  assert.throws(
    () => createShellGate({ ...base, advisoryRuleset: true, readonlyOnly: true, operatorChannel: op }),
    /互斥/,
  );
  assert.throws(
    () => createShellGate({ ...base, advisoryRuleset: true, operatorOnly: true, operatorChannel: op }),
    /互斥/,
  );
  assert.throws(
    () => createShellGate({ ...base, advisoryRuleset: true }),
    /必须提供 operatorChannel/,
  );
});

test("assembleProjectShellGate 项目角色默认 advisory：risky 跳过 (b) 直接交 (a)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shell-advisory-"));
  try {
    const roleDir = path.join(root, "角色卡", "X");
    fs.mkdirSync(roleDir, { recursive: true });
    fs.writeFileSync(path.join(roleDir, "role-card.md"), "# 角色 X\n");
    fs.writeFileSync(
      path.join(roleDir, "boundary.yaml"),
      "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 测试\n",
    );
    const project: ProjectConfig = {
      projectRoot: root,
      skillRoot: root,
      roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
      builtInRoles: ["su"],
      governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test" } },
    };
    const prompts: OperatorPrompt[] = [];
    let pmCalls = 0;
    const audit = createMemoryAuditSink();
    const gate = await assembleProjectShellGate({
      project,
      operatorChannel: operatorStub({ outcome: "allow", operatorId: "judge:claude" }, prompts),
      classifyShell,
      rules: defaultShellRules(),
      sessionDeps: {
        createAdapter: (writeGate: WriteGate): RuntimeAdapter =>
          createFakeRuntimeAdapter({ gate: writeGate, script: [] }),
      },
      openSession: async () => {
        pmCalls += 1;
        throw new Error("不应调用 (b)");
      },
      auditSink: audit,
    });
    const r = await gate({ command: "rm -rf build", argv: ["rm", "-rf", "build"], cwd: "/proj", toolCallId: "call-a" });
    assert.equal(r.allow, true, "advisory 下 (c) 不得直接拒绝");
    assert.equal(pmCalls, 0, "advisory 跳过 (b)");
    assert.equal(prompts.length, 1, "risky 应交 (a)");
    assert.match(audit.records.at(-1)?.branch ?? "", /^c-risky→a-allow$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
