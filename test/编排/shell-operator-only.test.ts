// test/编排/shell-operator-only.test.ts
// 编排角色自测：**su 审批档**（`operatorOnly` + `approveDeny`，客户裁定 2026-10-17：
// 「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」）。
// 依据 PM 评审 `2026-10-17_design_su-shell-approval-review.md` §3.1–§3.4、§4、§5.1。
//
// 覆盖（全部假件；只在闸层判定，不真跑任何命令）：
//   ① allow → 0 次 operator、branch `c-allow`、by 带「（su 审批档）」；审计字段齐备。
//   ② risky/review/deny × 批准/拒绝/超时/不可用 → `c-<tier>→a-*`，allow/deny 如实。
//   ③ deny + approveDeny=false → 既有硬拒（`c-deny`，0 次 operator，回归）。
//   ④ 构造守卫（互斥 / approveDeny 无 operatorOnly / 无通道 / 带 pmAsk / 带 routineShellPolicy）。
//   ⑤ `renderSuApprovalReason` 金文本；`assembleOperatorShellGate` 装配与 fail-closed。
//   ⑥ `openRoleSession`：su-only、与 shellReadonly 互斥、项目角色误传不 arm。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  OperatorChannelFn,
  OperatorOutcome,
  OperatorPrompt,
  RuntimeAdapter,
  RoleSession,
  SessionEvent,
  ShellGate,
  WriteGate,
} from "../../src/model/runtime.ts";
import {
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
  BRANCH_C_REVIEW,
  BRANCH_C_RISKY,
  SU_APPROVAL_REASON_PREFIX,
  createShellGate,
  renderSuApprovalReason,
  type ClassifyShellFn,
  type ShellClass,
  type ShellRules,
} from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import { formatOperatorPrompt } from "../../src/common/编排/operator-channel.ts";
import { assembleOperatorShellGate, type AssembleOperatorShellGateOptions } from "../../src/pipeline/orchestration/shell-arming.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";

const RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };
const REQ = { command: "rm -rf build", argv: ["rm", "-rf", "build"], cwd: "/proj", toolCallId: "call-1" };

function classifier(decision: ShellClass, ruleId: string, reason?: string): ClassifyShellFn {
  return () => ({ decision, ruleId, ...(reason !== undefined ? { reason } : {}) });
}

function operatorStub(
  outcome: OperatorOutcome | (() => Promise<OperatorOutcome>),
  prompts: OperatorPrompt[],
): OperatorChannelFn {
  return (prompt) => {
    prompts.push(prompt);
    return typeof outcome === "function" ? outcome() : outcome;
  };
}

function gateWith(opts: {
  classify: ClassifyShellFn;
  operator: OperatorChannelFn;
  approveDeny?: boolean;
  operatorTimeoutMs?: number;
  timeoutMs?: number;
  rules?: ShellRules | (() => ShellRules | Promise<ShellRules>);
}) {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: opts.classify,
    rules: opts.rules ?? RULES,
    rulesId: "test",
    audit,
    operatorOnly: true,
    approveDeny: opts.approveDeny ?? true,
    operatorChannel: opts.operator,
    ...(opts.operatorTimeoutMs !== undefined ? { operatorTimeoutMs: opts.operatorTimeoutMs } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  return { gate, audit };
}

// —————————————————————— ① allow：0 卡 ——————————————————————

test("allow：直接放行、operator 调用 0 次、branch c-allow；审计含 command/argv/cwd/by/conditions", async () => {
  const prompts: OperatorPrompt[] = [];
  const { gate, audit } = gateWith({
    classify: classifier("allow", "readonly:ls"),
    operator: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts),
  });

  const r = await gate({ command: "ls -la", argv: ["ls", "-la"], cwd: "/proj", toolCallId: "c-allow" });
  assert.equal(r.allow, true);
  if (r.allow) assert.equal(r.by, "ruleset:readonly:ls（su 审批档）");
  assert.equal(prompts.length, 0, "allow 不得弹卡（0 次 operator）");

  const rec = audit.records[0];
  assert.equal(rec.branch, BRANCH_C_ALLOW);
  assert.equal(rec.conclusion, "allow");
  assert.equal(rec.command, "ls -la");
  assert.deepEqual(rec.argv, ["ls", "-la"]);
  assert.equal(rec.cwd, "/proj");
  assert.ok(rec.by.includes("（su 审批档）"));
  assert.deepEqual(rec.conditions, ["shell-gate"]);
  assert.equal(rec.execution, "未执行");
});

// —————————————————————— ② risky / review / deny × a 结果 ——————————————————————

test("risky：批准 → c-risky→a-allow；reason 用 su 审批档前缀并披露写边界风险", async () => {
  const prompts: OperatorPrompt[] = [];
  const { gate, audit } = gateWith({
    classify: classifier("risky", "risky:delete", "命中危险程序规则：rm"),
    operator: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts),
  });

  const r = await gate(REQ);
  assert.equal(r.allow, true);
  if (r.allow) assert.equal(r.by, "ruleset:risky:delete（su 审批档） → operator:客户");
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].reason, renderSuApprovalReason("risky", "命中危险程序规则：rm"));
  assert.match(prompts[0].reason!, /^su-审批档\[risky\]：/);
  assert.match(prompts[0].reason!, /可能绕过 ANS 文件写边界/);
  assert.equal(audit.records[0].branch, `${BRANCH_C_RISKY}→a-allow`);
  assert.equal(audit.records[0].conclusion, "allow");
});

test("risky：拒绝 → c-risky→a-deny；超时 → c-risky→a-timeout；不可用 → c-risky→a-unavailable", async () => {
  const denyPrompts: OperatorPrompt[] = [];
  const deny = await gateWith({
    classify: classifier("risky", "risky:delete"),
    operator: operatorStub({ outcome: "deny", operatorId: "客户", reason: "不批准" }, denyPrompts),
  }).gate(REQ);
  assert.equal(deny.allow, false);
  assert.equal(denyPrompts.length, 1);

  const timeout = await gateWith({
    classify: classifier("risky", "risky:delete"),
    operator: () => new Promise<OperatorOutcome>(() => {}),
    operatorTimeoutMs: 20,
    timeoutMs: 1000,
  }).gate(REQ);
  assert.equal(timeout.allow, false);
  if (!timeout.allow) assert.match(timeout.reason, /超时/);

  const unavailable = await gateWith({
    classify: classifier("risky", "risky:delete"),
    operator: operatorStub({ outcome: "unavailable", reason: "轮次已结束，旧确认失效" }, []),
  }).gate(REQ);
  assert.equal(unavailable.allow, false);
  if (!unavailable.allow) assert.match(unavailable.reason, /轮次已结束/);
});

test("review：批准 → c-review→a-allow；拒绝 → c-review→a-deny（不接 (b)）", async () => {
  const okPrompts: OperatorPrompt[] = [];
  const ok = await gateWith({
    classify: classifier("review", "review:none", "未匹配任何规则"),
    operator: operatorStub({ outcome: "allow", operatorId: "客户" }, okPrompts),
  }).gate({ ...REQ, command: "unknown-cmd", argv: ["unknown-cmd"] });
  assert.equal(ok.allow, true);
  assert.equal(okPrompts.length, 1);

  const denyPrompts: OperatorPrompt[] = [];
  const deny = await gateWith({
    classify: classifier("review", "review:none"),
    operator: operatorStub({ outcome: "deny", operatorId: "客户" }, denyPrompts),
  }).gate({ ...REQ, command: "unknown-cmd", argv: ["unknown-cmd"] });
  assert.equal(deny.allow, false);
  assert.equal(denyPrompts.length, 1);
  assert.match(okPrompts[0].reason!, /^su-审批档\[review\]：/);
});

test("deny + approveDeny=true：批准 → c-deny→a-allow；拒绝 → c-deny→a-deny", async () => {
  const approvePrompts: OperatorPrompt[] = [];
  const approveGate = gateWith({
    classify: classifier("deny", "deny:reshell", "命中硬拒程序规则：reshell"),
    operator: operatorStub({ outcome: "allow", operatorId: "客户" }, approvePrompts),
    approveDeny: true,
  });
  const approved = await approveGate.gate({ ...REQ, command: 'sh -c "echo hi"', argv: ["sh", "-c", "echo hi"] });
  assert.equal(approved.allow, true);
  assert.equal(approvePrompts.length, 1);
  assert.match(approvePrompts[0].reason!, /^su-审批档\[deny\]：/);
  assert.match(approvePrompts[0].reason!, /reshell/);
  assert.equal(approveGate.audit.records[0].branch, `${BRANCH_C_DENY}→a-allow`);

  const denyPrompts: OperatorPrompt[] = [];
  const denied = await gateWith({
    classify: classifier("deny", "deny:reshell"),
    operator: operatorStub({ outcome: "deny", operatorId: "客户" }, denyPrompts),
    approveDeny: true,
  }).gate(REQ);
  assert.equal(denied.allow, false);
  assert.equal(denyPrompts.length, 1);
});

test("deny + approveDeny=false：既有硬拒终结（c-deny，0 次 operator，回归）", async () => {
  const prompts: OperatorPrompt[] = [];
  const { gate, audit } = gateWith({
    classify: classifier("deny", "deny:reshell", "命中硬拒程序规则：reshell"),
    operator: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts),
    approveDeny: false,
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(prompts.length, 0, "approveDeny=false 不得弹卡");
  assert.equal(audit.records[0].branch, BRANCH_C_DENY);
  assert.equal(audit.records[0].by, "ruleset:deny:reshell（su 审批档）");
});

// —————————————————————— ④ 构造守卫 ——————————————————————

test("构造守卫：模式互斥 / approveDeny 无 operatorOnly / 无通道 / 带 pmAsk / 带 routineShellPolicy", () => {
  const audit = createMemoryAuditSink();
  const base = { classifyShell: classifier("allow", "x"), rules: RULES, rulesId: "t", audit };
  const op: OperatorChannelFn = () => ({ outcome: "deny" });

  assert.throws(() => createShellGate({ ...base, readonlyOnly: true, operatorOnly: true, operatorChannel: op }), /互斥/);
  assert.throws(() => createShellGate({ ...base, approveDeny: true }), /approveDeny 仅在 operatorOnly/);
  assert.throws(() => createShellGate({ ...base, operatorOnly: true }), /必须提供 operatorChannel/);
  assert.throws(
    () => createShellGate({ ...base, operatorOnly: true, operatorChannel: op, pmAsk: () => "allow" }),
    /pmAsk\/routineShellPolicy/,
  );
  assert.throws(
    () =>
      createShellGate({
        ...base,
        operatorOnly: true,
        operatorChannel: op,
        routineShellPolicy: {
          enabled: true,
          projectRoot: "/proj",
          authorizationSource: "customer-delegated-routine-checks",
        },
      }),
    /pmAsk\/routineShellPolicy/,
  );
});

// —————————————————————— ⑤ 文案与装配 ——————————————————————

test("renderSuApprovalReason：前缀/档位/命中原因/写边界警告逐字；项目三层链文案不含前缀", () => {
  for (const tier of ["risky", "review", "deny"] as const) {
    const text = renderSuApprovalReason(tier, "命中原因");
    assert.equal(
      text,
      `${SU_APPROVAL_REASON_PREFIX}[${tier}]：命中原因；批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界。`,
    );
    assert.match(text, /^su-审批档\[(risky|review|deny)\]/);
  }
  assert.equal(SU_APPROVAL_REASON_PREFIX, "su-审批档");
});

test("CLI 提示：su 审批档不再写「(b) 未定」；非审批档维持既有文案", () => {
  const su = formatOperatorPrompt({
    command: "rm -rf build",
    argv: ["rm", "-rf", "build"],
    cwd: "/proj",
    toolCallId: "t",
    reason: renderSuApprovalReason("risky", "命中危险程序规则：rm"),
  });
  assert.match(su, /su 审批档：客户逐条批准，不走 \(b\) 审读/);
  assert.equal(su.includes("(b) 未定"), false);

  const project = formatOperatorPrompt({ command: "x", argv: ["x"], cwd: "/proj", toolCallId: "t", reason: "pm 拿不准" });
  assert.match(project, /\(b\) 未定，\(a\) 请操作者确认/);
});

function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-su-approval-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 测试条目\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
}
const cleanup = (p: ProjectConfig): void => fs.rmSync(p.projectRoot, { recursive: true, force: true });

test("assembleOperatorShellGate：allow 0 卡；risky 出卡；审计落 sink；缺 classifier/rules fail-closed", async () => {
  const project = makeTempProject();
  try {
    const audit = createMemoryAuditSink();
    const prompts: OperatorPrompt[] = [];
    const gate = await assembleOperatorShellGate({
      project,
      classifyShell: (argv) => (argv[0] === "ls" ? { decision: "allow", ruleId: "readonly:ls" } : { decision: "risky", ruleId: "risky:delete" }),
      rules: RULES,
      operatorChannel: operatorStub({ outcome: "allow", operatorId: "客户" }, prompts),
      auditSink: audit,
    });

    const allow = await gate({ command: "ls -la", argv: ["ls", "-la"], cwd: project.projectRoot, toolCallId: "a" });
    assert.equal(allow.allow, true);
    assert.equal(prompts.length, 0, "allow 不弹卡");

    const risky = await gate({ command: "rm -rf x", argv: ["rm", "-rf", "x"], cwd: project.projectRoot, toolCallId: "b" });
    assert.equal(risky.allow, true);
    assert.equal(prompts.length, 1);

    assert.deepEqual(audit.records.map((r) => r.branch), [BRANCH_C_ALLOW, `${BRANCH_C_RISKY}→a-allow`]);

    // fail-closed：缺 classifier → no-classifier；缺 rules → ruleset-load-failed。
    const noClassifier = await assembleOperatorShellGate({ project, rules: RULES, operatorChannel: () => ({ outcome: "allow" }), auditSink: createMemoryAuditSink() });
    const r1 = await noClassifier(REQ);
    assert.equal(r1.allow, false);
    const noRules = await assembleOperatorShellGate({ project, classifyShell: classifier("allow", "x"), operatorChannel: () => ({ outcome: "allow" }), auditSink: createMemoryAuditSink() });
    const r2 = await noRules(REQ);
    assert.equal(r2.allow, false);
  } finally {
    cleanup(project);
  }
});

// —————————————————————— ⑥ run-role：su-only / 互斥 ——————————————————————

function capsCapturingAdapter(): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  return {
    caps: () => captured,
    createAdapter: (_gate, capabilities) => {
      captured = capabilities;
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                yield { kind: "settled", summary: "完成" } as SessionEvent;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

test("openRoleSession：su + shellOperatorOnly ⇒ arm；项目角色误传/与 shellReadonly 同时给出 ⇒ 不 arm", async () => {
  const project = makeTempProject();
  try {
    const suArm = capsCapturingAdapter();
    const h1 = await openRoleSession(
      {
        roleId: "su",
        project,
        shellOperatorOnly: {
          classifyShell: classifier("allow", "readonly:ls"),
          rules: RULES,
          operatorChannel: () => ({ outcome: "deny", operatorId: "客户" }),
          auditSink: createMemoryAuditSink(),
        },
      },
      { createAdapter: suArm.createAdapter },
    );
    const suGate = suArm.caps()?.shellGate as ShellGate | undefined;
    assert.equal(typeof suGate, "function", "su 应 arm 审批档");
    const allow = await suGate!({ command: "ls", argv: ["ls"], cwd: project.projectRoot, toolCallId: "t" });
    assert.equal(allow.allow, true);
    await h1.dispose();

    // 项目角色误传 → 不 arm（防止三层链被绕成客户全权审批）。
    const projectRole = capsCapturingAdapter();
    const h2 = await openRoleSession(
      {
        roleId: "X",
        project,
        shellOperatorOnly: {
          classifyShell: classifier("allow", "x"),
          rules: RULES,
          operatorChannel: () => ({ outcome: "allow" }),
        },
      },
      { createAdapter: projectRole.createAdapter },
    );
    assert.equal(projectRole.caps()?.shellGate, undefined, "项目角色不得 arm 审批档");
    await h2.dispose();

    // 与 shellReadonly 同时给出 ⇒ 不 arm（不择一静默生效）。
    const both = capsCapturingAdapter();
    const h3 = await openRoleSession(
      {
        roleId: "su",
        project,
        shellOperatorOnly: { classifyShell: classifier("allow", "x"), rules: RULES, operatorChannel: () => ({ outcome: "allow" }) },
        shellReadonly: { classifyShell: classifier("allow", "x"), rules: RULES },
      },
      { createAdapter: both.createAdapter },
    );
    assert.equal(both.caps()?.shellGate, undefined, "互斥时不得 arm");
    await h3.dispose();

    // 缺通道（运行期误传）⇒ 构造守卫抛错 ⇒ 不 arm。
    const missingChannel = capsCapturingAdapter();
    const h4 = await openRoleSession(
      {
        roleId: "su",
        project,
        shellOperatorOnly: {
          classifyShell: classifier("allow", "x"),
          rules: RULES,
        } as unknown as Omit<AssembleOperatorShellGateOptions, "project">,
      },
      { createAdapter: missingChannel.createAdapter },
    );
    assert.equal(missingChannel.caps()?.shellGate, undefined, "缺通道不得 arm");
    await h4.dispose();
  } finally {
    cleanup(project);
  }
});
