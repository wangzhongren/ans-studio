// test/编排/customer-directive-gate.test.ts
// B1（2026-11-03 客户授权平面）：shell 闸审批消费者顺序矩阵与接线。
//
// 覆盖（B1 提案 §4/§6 AC-8/AC-9）：
//   · deny 指令先于 c=allow/script；allow 指令只在 review/risky（既有 takeGrant 先）；
//   · c=allow / c=deny / script / preblock / write-guard 不查/不消费 allow 指令；
//   · once 消费由 Pipeline 回调完成（gate 只按返回结果放行；消费失败 ⇒ undefined 回落）；
//   · readonly 构造期禁止注入；审计 `by:"directive:<id>"` + `directive:{id,scope}`（与 judge/customerGrant 互斥）；
//   · buildShellGate / shell-arming / run-role 的透传接线。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import type { OperatorChannelFn, ShellGrant } from "../../src/model/runtime.ts";
import {
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
  BRANCH_DIRECTIVE_ALLOW,
  BRANCH_DIRECTIVE_DENY,
  buildShellGate,
  createShellGate,
  type ClassifyShellFn,
  type ShellDirectiveDecision,
  type ShellRules,
  type TakeDirectiveFn,
} from "../../src/common/编排/shell-gate.ts";
import {
  createMemoryAuditSink,
} from "../../src/common/编排/shell-audit.ts";
import {
  assembleProjectShellGate,
  type AssembleShellGateOptions,
} from "../../src/pipeline/orchestration/shell-arming.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { createCustomerDirectiveRuntime } from "../../src/pipeline/orchestration/customer-directive.ts";
import { CUSTOMER_DIRECTIVES_REL } from "../../src/model/directive.ts";

// —————————————————————— 夹具 ——————————————————————

const RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };
const RULES_ID = "test-ruleset";
const REQ = { command: "npm install", argv: ["npm", "install"], cwd: "/proj", toolCallId: "call-1" };

const ALLOW_ONCE: ShellDirectiveDecision = { action: "allow", id: "d-1", scope: "once" };
const DENY_SESSION: ShellDirectiveDecision = { action: "deny", id: "d-2", scope: "session" };

const denyOperator: OperatorChannelFn = () => ({ outcome: "deny", operatorId: "cust" });
const allowOperator: OperatorChannelFn = () => ({ outcome: "allow", operatorId: "cust" });

function gateWith(opts: {
  classify: ClassifyShellFn;
  directive?: TakeDirectiveFn;
  operator?: OperatorChannelFn;
  advisoryRuleset?: boolean;
  operatorOnly?: boolean;
  approveDeny?: boolean;
  writeGuard?: (req: import("../../src/model/runtime.ts").ShellReviewRequest) => { kind: "pass" } | { kind: "script"; reason: string } | { kind: "deny"; reason: string; targets: string[] };
  grant?: ShellGrant;
  loader?: () => Promise<{ ok: true; context: never } | { ok: false; reason: string }>;
  onReviewed?: (req: typeof REQ, outcome: { directive?: { id: string; scope: "once" | "session" | "forever" } }) => void;
  audit?: ReturnType<typeof createMemoryAuditSink>;
}) {
  const audit = opts.audit ?? createMemoryAuditSink();
  const directiveCalls: Array<"allow" | "deny" | "none"> = [];
  const grantCalls: number[] = [];
  const operatorCalls: number[] = [];
  const gate = createShellGate({
    classifyShell: opts.classify,
    rules: RULES,
    rulesId: RULES_ID,
    audit,
    ...(opts.operator !== undefined
      ? {
          operatorChannel: (prompt: Parameters<OperatorChannelFn>[0]) => {
            operatorCalls.push(1);
            return opts.operator!(prompt);
          },
        }
      : {}),
    ...(opts.advisoryRuleset === true ? { advisoryRuleset: true } : {}),
    ...(opts.operatorOnly === true ? { operatorOnly: true, approveDeny: opts.approveDeny === true } : {}),
    ...(opts.writeGuard !== undefined ? { writeGuard: opts.writeGuard } : {}),
    ...(opts.loader !== undefined ? { approvalContextLoader: opts.loader as never } : {}),
    ...(opts.onReviewed !== undefined ? { onReviewed: opts.onReviewed as never } : {}),
    ...(opts.grant !== undefined
      ? {
          takeGrant: () => {
            grantCalls.push(1);
            return opts.grant;
          },
        }
      : {}),
    ...(opts.directive !== undefined
      ? {
          takeDirective: (req, intent) => {
            directiveCalls.push(intent ?? "none");
            return opts.directive!(req, intent);
          },
        }
      : {}),
  });
  return { gate, audit, directiveCalls, grantCalls, operatorCalls };
}

/** 只对 allow 阶段返回指令；deny 预检返回 undefined（不消费）。 */
const allowOnly: TakeDirectiveFn = (_req, intent) => (intent === "deny" ? undefined : ALLOW_ONCE);
/** deny 阶段返回 deny；allow 阶段不会到达（deny 已终结）。 */
const denyOnly: TakeDirectiveFn = (_req, intent) => (intent === "deny" ? DENY_SESSION : undefined);

function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-directive-gate-"));
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

// —————————————————————— deny 顺序 ——————————————————————

test("deny 指令先于 c=allow：拒绝白名单命令；审计 by=directive:<id> + directive 字段", async () => {
  const { gate, audit, directiveCalls } = gateWith({
    classify: () => "allow",
    directive: denyOnly,
    operator: allowOperator,
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  if (r.allow) return;
  assert.equal(r.by, "directive:d-2");
  assert.deepEqual(r.directive, { id: "d-2", scope: "session" });
  const rec = audit.records[0]!;
  assert.equal(rec.branch, BRANCH_DIRECTIVE_DENY);
  assert.equal(rec.conclusion, "deny");
  assert.equal(rec.by, "directive:d-2");
  assert.deepEqual(rec.directive, { id: "d-2", scope: "session" });
  assert.equal(rec.judge, undefined);
  assert.equal(rec.customerGrant, undefined);
  assert.deepEqual(directiveCalls, ["deny"], "deny 预检只查 deny 阶段");
});

test("preblock / write-guard 在指令之前终结：不调用 takeDirective（不翻案硬地板）", async () => {
  const pre = gateWith({
    classify: () => "allow",
    directive: denyOnly,
  });
  const preResult = await pre.gate({ command: "grep -r foo", argv: ["grep", "-r", "foo"], cwd: "/proj", toolCallId: "t-pre" });
  assert.equal(preResult.allow, false);
  assert.deepEqual(pre.directiveCalls, [], "preblock 不查指令");

  const wg = gateWith({
    classify: () => "allow",
    directive: denyOnly,
    writeGuard: () => ({ kind: "deny", reason: "越界写", targets: ["/etc/x"] }),
  });
  const wgResult = await wg.gate(REQ);
  assert.equal(wgResult.allow, false);
  assert.equal(wg.audit.records[0]!.branch, "write-guard:deny");
  assert.deepEqual(wg.directiveCalls, [], "write-guard 不查指令");
});

test("c=deny / script 不消费 allow 指令；allow 只在 review/risky 应用", async () => {
  // c=deny：只走 deny 预检（返回 undefined），allow 阶段不执行。
  const denyClass = gateWith({
    classify: () => "deny",
    directive: (req, intent) => (intent === "deny" ? undefined : ALLOW_ONCE),
  });
  const denied = await denyClass.gate(REQ);
  assert.equal(denied.allow, false);
  assert.equal(denyClass.audit.records[0]!.branch, BRANCH_C_DENY);
  assert.deepEqual(denyClass.directiveCalls, ["deny"], "c=deny 不查 allow 指令");

  // script：deny 预检后进入 script 分支；allow 指令不适用。
  const script = gateWith({
    classify: () => "review",
    directive: (req, intent) => (intent === "deny" ? undefined : ALLOW_ONCE),
    writeGuard: () => ({ kind: "script", reason: "脚本" }),
    loader: async () => ({ ok: true, context: {} as never }),
    operator: denyOperator,
  });
  const scriptResult = await script.gate({ command: "node scripts/x.mjs", argv: ["node", "scripts/x.mjs"], cwd: "/proj", toolCallId: "t-script" });
  assert.equal(scriptResult.allow, false, "script 不因 allow 指令放行");
  assert.deepEqual(script.directiveCalls, ["deny"], "script 分支不查 allow 指令");

  // c=allow：不查 allow 指令、不消费。
  const allowClass = gateWith({
    classify: () => "allow",
    directive: (req, intent) => (intent === "deny" ? undefined : ALLOW_ONCE),
  });
  const allowed = await allowClass.gate(REQ);
  assert.equal(allowed.allow, true);
  assert.equal(allowClass.audit.records[0]!.branch, BRANCH_C_ALLOW);
  assert.deepEqual(allowed.directive, undefined);
  assert.deepEqual(allowClass.directiveCalls, ["deny"], "c=allow 不查/不消费 allow 指令");
});

// —————————————————————— allow 顺序 ——————————————————————

test("review/risky：既有 takeGrant 先；未命中 ⇒ 指令 allow（审计 directive，不写 judge/customerGrant）", async () => {
  const grant = { scope: "once" as const, requestId: "grant-1", operatorId: "cust" };
  const granted = gateWith({
    classify: () => "review",
    directive: allowOnly,
    grant,
    operator: denyOperator,
  });
  const r1 = await granted.gate(REQ);
  assert.equal(r1.allow, true);
  if (r1.allow) assert.deepEqual(r1.grant, grant);
  assert.deepEqual(granted.directiveCalls, ["deny"], "既有 takeGrant 命中 ⇒ 不查 allow 指令（deny 预检仍执行）");

  const direct = gateWith({
    classify: () => "review",
    directive: allowOnly,
    operator: denyOperator,
  });
  const r2 = await direct.gate(REQ);
  assert.equal(r2.allow, true);
  if (r2.allow) {
    assert.equal(r2.by, "directive:d-1");
    assert.deepEqual(r2.directive, { id: "d-1", scope: "once" });
  }
  assert.deepEqual(direct.directiveCalls, ["deny", "allow"]);
  const rec = direct.audit.records[0]!;
  assert.equal(rec.branch, BRANCH_DIRECTIVE_ALLOW);
  assert.deepEqual(rec.directive, { id: "d-1", scope: "once" });
  assert.equal(rec.judge, undefined);
  assert.equal(rec.customerGrant, undefined);

  const risky = gateWith({ classify: () => "risky", directive: allowOnly, operator: denyOperator });
  const r3 = await risky.gate(REQ);
  assert.equal(r3.allow, true, "risky 同样在既有审批链之前应用指令");
});

test("once 消费语义：gate 只按回调返回放行；第二次回调返回 undefined ⇒ 回落既有路径", async () => {
  let used = false;
  const consumeOnce: TakeDirectiveFn = (_req, intent) => {
    if (intent === "deny") return undefined;
    if (used) return undefined;
    used = true;
    return ALLOW_ONCE;
  };
  const { gate, audit, operatorCalls } = gateWith({ classify: () => "review", directive: consumeOnce, operator: denyOperator });
  const first = await gate(REQ);
  assert.equal(first.allow, true);
  const second = await gate({ ...REQ, toolCallId: "call-2" });
  assert.equal(second.allow, false, "once 用尽 ⇒ 既不重复放行也不静默放行");
  assert.equal(audit.records[1]!.branch, "b-unavailable→a-deny");
  assert.equal(operatorCalls.length, 1, "第二次回落既有 (a) 通道");
});

test("operatorOnly / advisory：指令 allow 在既有审批链之前放行（不调 operator）", async () => {
  const operatorOnly = gateWith({
    classify: () => "risky",
    directive: allowOnly,
    operatorOnly: true,
    approveDeny: true,
    operator: denyOperator,
  });
  const r1 = await operatorOnly.gate(REQ);
  assert.equal(r1.allow, true);
  assert.equal(operatorOnly.operatorCalls.length, 0);

  const advisory = gateWith({
    classify: () => "review",
    directive: allowOnly,
    advisoryRuleset: true,
    operator: denyOperator,
  });
  const r2 = await advisory.gate(REQ);
  assert.equal(r2.allow, true);
  assert.equal(advisory.operatorCalls.length, 0);
});

test("readonlyOnly + takeDirective ⇒ 构造期抛错（只读拒绝不得被客户指令越过）", () => {
  assert.throws(
    () =>
      createShellGate({
        classifyShell: () => "allow",
        rules: RULES,
        audit: createMemoryAuditSink(),
        readonlyOnly: true,
        takeDirective: allowOnly,
      }),
    /readonlyOnly 不得注入 takeDirective/,
  );
});

test("onReviewed：指令结果携带 directive（与 judge 互斥）；无指令结果保持旧形状", async () => {
  const seen: Array<{ directive?: { id: string; scope: "once" | "session" | "forever" }; judge?: unknown }> = [];
  const { gate } = gateWith({
    classify: () => "review",
    directive: allowOnly,
    operator: denyOperator,
    onReviewed: (_req, outcome) => seen.push({ ...(outcome.directive !== undefined ? { directive: outcome.directive } : {}) }),
  });
  await gate(REQ);
  assert.deepEqual(seen, [{ directive: { id: "d-1", scope: "once" } }]);
});

// —————————————————————— buildShellGate / shell-arming / run-role 接线 ——————————————————————

test("buildShellGate：takeDirective 透传到闸", async () => {
  const audit = createMemoryAuditSink();
  const gate = buildShellGate({
    projectRoot: "/proj",
    skillRoot: "/proj",
    pmBoundary: { entries: [], boundarySource: "test", acceptance: { accepted: true, source: "test" } },
    auditSink: audit,
    classifyShell: () => "allow",
    rules: RULES,
    takeDirective: denyOnly,
  });
  const r = await gate(REQ);
  assert.equal(r.allow, false);
  assert.equal(audit.records[0]!.branch, BRANCH_DIRECTIVE_DENY);
});

test("assembleProjectShellGate：审批指令注入点透传（项目三层链）", async () => {
  const project = makeTempProject();
  try {
    const audit = createMemoryAuditSink();
    const gate = await assembleProjectShellGate({
      project,
      operatorChannel: denyOperator,
      classifyShell: () => "review",
      rules: RULES,
      advisoryRuleset: false,
      auditSink: audit,
      takeDirective: allowOnly,
      sessionDeps: { createAdapter: (gate2: WriteGate) => createFakeRuntimeAdapter({ gate: gate2, script: [] }) },
      openSession: async () => { throw new Error("无审读会话"); },
    });
    const r = await gate({ ...REQ, cwd: project.projectRoot });
    assert.equal(r.allow, true);
    if (r.allow) assert.equal(r.by, "directive:d-1");
    assert.equal(audit.records[0]!.branch, BRANCH_DIRECTIVE_ALLOW);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("openRoleSession：customerDirective 注入 ⇒ shell 闸命中审批指令；未注入 ⇒ 旧链不变", async () => {
  const project = makeTempProject();
  try {
    // 真实 Pipeline 句柄：先落一条 approval allow once。presenter 返回相同命令/项目根。
    // 命令用 `echo hello`（非 package script）以避开 script 分支——allow 指令不适用于 script（AC-8）。
    const runtime = createCustomerDirectiveRuntime({
      projectRoot: project.projectRoot,
      sessionId: "session-A",
      present: {
        async present() {
          return {
            decision: "confirm",
            values: {
              action: { kind: "allow", resource: { type: "shell", command: "echo hello", cwd: project.projectRoot } },
              scope: {},
              until: "once",
            },
          };
        },
      },
    });
    const submitted = await runtime.submitFromInput({
      rawText: '@审批 允许 shell "echo hello" once',
      target: "approval",
      projectRoot: project.projectRoot,
      roleId: "X",
      clientMessageId: "gate-run-role-1",
      decisionGroupEnabled: true,
    });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    const factsBefore = await runtime.approvalFacts();
    assert.equal(factsBefore.active.length, 1, "前置：审批指令已 active");
    assert.equal(factsBefore.active[0]!.action.resource.type, "shell");

    const captured = capsCapturingAdapter();
    const handle = await openRoleSession(
      {
        roleId: "X",
        project,
        shellOperatorChannel: denyOperator,
        customerDirective: runtime,
        shellArming: {
          classifyShell: () => "review",
          rules: RULES,
          advisoryRuleset: false,
          openSession: async () => { throw new Error("无审读会话"); },
        },
      },
      { createAdapter: captured.createAdapter },
    );
    try {
      const gate = captured.caps()?.shellGate;
      assert.equal(typeof gate, "function", "shell 已 arm");
      const result = await gate!({ command: "echo hello", argv: ["echo", "hello"], cwd: project.projectRoot, toolCallId: "tc-1" });
      assert.equal(result.allow, true, JSON.stringify(result));
      if (result.allow) {
        assert.equal(result.by, "directive:d-1");
        assert.deepEqual(result.directive, { id: "d-1", scope: "once" });
      }
    } finally {
      await handle.dispose();
    }

    // 未注入 customerDirective ⇒ 同一 classification 走既有 (a) 拒绝（不出现 directive）。
    const legacy = capsCapturingAdapter();
    const legacyHandle = await openRoleSession(
      {
        roleId: "X",
        project,
        shellOperatorChannel: denyOperator,
        shellArming: {
          classifyShell: () => "review",
          rules: RULES,
          advisoryRuleset: false,
          openSession: async () => { throw new Error("无审读会话"); },
        },
      },
      { createAdapter: legacy.createAdapter },
    );
    try {
      const gate = legacy.caps()?.shellGate;
      const result = await gate!({ command: "echo hello", argv: ["echo", "hello"], cwd: project.projectRoot, toolCallId: "tc-2" });
      assert.equal(result.allow, false);
      assert.equal(result.directive, undefined);
    } finally {
      await legacyHandle.dispose();
    }
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

// type-only：只读档选项面不得出现 takeDirective（结构上不可注入）。
function _readonlyOptionsTypeCheck(): void {
  const options: import("../../src/pipeline/orchestration/shell-arming.ts").AssembleReadonlyShellGateOptions = {
    project: { projectRoot: "/p", skillRoot: "/p", roles: {} },
    // @ts-expect-error 只读档类型面不提供 takeDirective
    takeDirective: allowOnly,
  };
  void options;
}
void _readonlyOptionsTypeCheck;

// 供 lint/类型读取：CUSTOMER_DIRECTIVES_REL 只读导入用于断言路径一致性（避免未使用告警）。
void CUSTOMER_DIRECTIVES_REL;
void ({} as AssembleShellGateOptions);
