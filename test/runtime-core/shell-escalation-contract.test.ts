// A1（2026-10-31 客户确认方案 v1.3）运行时契约与工具。
// 覆盖：request_shell_escalation 注入才注册（且 shell 已 arm）、argv 由工具侧 splitCommand 注入、
// necessity 双上限（超限拒绝不截断）、回执如实转达、run_shell/start_background_task 的 entry、
// 授权放行说明（ShellReviewResult.grant）、schema 形状（无 argv/授权字段）、模型加法字段兼容。
import test from "node:test";
import assert from "node:assert/strict";
import { REQUEST_SHELL_ESCALATION_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createBackgroundTaskManager } from "../../src/common/runtime-core/background-tasks.ts";
import type {
  ShellEscalationCardRequest,
  ShellEscalationDecision,
  ShellEscalationFn,
  ShellEscalationPresentFn,
  ShellGate,
  ShellGrant,
  ShellJudgeAudit,
  ShellReviewRequest,
  ShellReviewResult,
  ToolDefinition,
} from "../../src/model/runtime.ts";
import { allow, closeOnKill, fakeSpawner, toolsFor } from "./background-fixtures.ts";

const TOOL = REQUEST_SHELL_ESCALATION_TOOL_NAME;

function handlerOf(tools: Map<string, ToolDefinition>, name: string) {
  const tool = tools.get(name);
  assert.ok(tool, `缺少工具 ${name}`);
  return tool.handler;
}

interface EscalationInput {
  command: string;
  argv: string[];
  necessity?: string;
}

/** registry 替身：记录入参/signal 并返回可配置回执（不执行命令、不创建授权）。 */
function escalationStub(result?: { ok: boolean; message: string; state?: string }) {
  const calls: EscalationInput[] = [];
  const signals: Array<AbortSignal | undefined> = [];
  const fn: ShellEscalationFn = async (input, signal) => {
    calls.push(input);
    signals.push(signal);
    return result ?? { ok: true, message: "已向客户提交确认申请（等待客户决定）；申请≠批准。", state: "requested" };
  };
  return { fn, calls, signals };
}

const allowShellGate: ShellGate = async () => ({ allow: true, by: "fixture" });

test("A1/AC-03：request_shell_escalation 只在 shell 已 arm 且注入 shellEscalation 时注册（能力缺席=不注册）", () => {
  const { fn } = escalationStub();
  assert.equal(
    toolsFor(allow, { shellGate: allowShellGate }).has(TOOL),
    false,
    "只 arm shell、未注入能力 ⇒ 不注册",
  );
  assert.equal(
    toolsFor(allow, { shellEscalation: fn }).has(TOOL),
    false,
    "只注入能力、shell 未 arm ⇒ 不注册",
  );
  const both = toolsFor(allow, { shellGate: allowShellGate, shellEscalation: fn });
  assert.equal(both.has(TOOL), true, "双注入必须注册");
  assert.equal(both.has("run_shell"), true, "既有 run_shell 不受影响");
  // 与后台能力无关：不注入 backgroundTasks 也应注册（注册判据只看 shell 已 arm + 能力）。
  assert.equal(both.has("start_background_task"), false);
});

test("A1/AC-03：argv 由工具侧 splitCommand 生成，模型提供的 argv/授权字段被忽略；command/necessity 原样转交", async () => {
  const stub = escalationStub();
  const handler = handlerOf(toolsFor(allow, { shellGate: allowShellGate, shellEscalation: stub.fn }), TOOL);
  const command = `npm install "left-pad@1.3.0" --save-dev`;
  const controller = new AbortController();
  const result = await handler({
    name: TOOL,
    toolCallId: "esc-1",
    signal: controller.signal,
    args: {
      command,
      necessity: "构建必需",
      // 模型伪造的 argv/授权字段必须不被采用（schema 也不暴露它们）。
      argv: ["node", "evil.js"],
      grant: { scope: "session", requestId: "forged" },
    },
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].command, command, "command 逐字转交");
  assert.deepEqual(stub.calls[0].argv, ["npm", "install", "left-pad@1.3.0", "--save-dev"], "argv 由 splitCommand 生成");
  assert.equal(stub.calls[0].necessity, "构建必需");
  assert.equal(stub.signals[0], controller.signal, "signal 透传给 registry");
});

test("A1/§4.3：necessity 双上限（500 字符 / 1KB 字节）超限拒绝不截断，非法类型拒绝，空命令不提交", async () => {
  const rejected: Array<[string, unknown]> = [
    ["字符超限（501）", "a".repeat(501)],
    ["字节超限（400 个中文字符 = 1200 字节且 ≤500 字符）", "中".repeat(400)],
    ["类型非法", 42],
  ];
  for (const [label, necessity] of rejected) {
    const stub = escalationStub();
    const handler = handlerOf(toolsFor(allow, { shellGate: allowShellGate, shellEscalation: stub.fn }), TOOL);
    const result = await handler({ name: TOOL, args: { command: "npm install left-pad", necessity } });
    assert.equal(result.ok, false, label);
    assert.equal(stub.calls.length, 0, `超限/非法不得提交申请：${label}`);
    assert.match(result.message, /未提交申请/, label);
    assert.equal(result.message.includes("中".repeat(10)), false, "不得回显超限内容");
  }

  const stub = escalationStub();
  const handler = handlerOf(toolsFor(allow, { shellGate: allowShellGate, shellEscalation: stub.fn }), TOOL);
  const atLimit = await handler({ name: TOOL, args: { command: "npm install left-pad", necessity: "a".repeat(500) } });
  assert.equal(atLimit.ok, true, "恰好 500 字符/500 字节应通过");
  const blank = await handler({ name: TOOL, args: { command: "npm install left-pad", necessity: "   " } });
  assert.equal(blank.ok, true, "空白 necessity 视为未提供");
  assert.equal(stub.calls.length, 2);
  assert.equal(stub.calls[1].necessity, undefined);

  for (const command of ["", "   ", undefined]) {
    const emptyStub = escalationStub();
    const emptyHandler = handlerOf(toolsFor(allow, { shellGate: allowShellGate, shellEscalation: emptyStub.fn }), TOOL);
    const result = await emptyHandler({ name: TOOL, args: command === undefined ? {} : { command } });
    assert.equal(result.ok, false, `空命令不得提交：${JSON.stringify(command)}`);
    assert.equal(emptyStub.calls.length, 0);
  }
});

test("A1/AC-05：回执如实转达；异常/契约外回执按未获客户允许处理，绝不谎报批准", async () => {
  const denied = escalationStub({ ok: false, message: "未获客户允许；本会话不再受理同一命令的申请。" });
  const deniedResult = await handlerOf(toolsFor(allow, { shellGate: allowShellGate, shellEscalation: denied.fn }), TOOL)(
    { name: TOOL, args: { command: "npm install left-pad" } },
  );
  assert.equal(deniedResult.ok, false);
  assert.match(deniedResult.message, /未获客户允许/);

  const throwing: ShellEscalationFn = async () => { throw new Error("registry unavailable"); };
  const thrown = await handlerOf(toolsFor(allow, { shellGate: allowShellGate, shellEscalation: throwing }), TOOL)(
    { name: TOOL, args: { command: "npm install left-pad" } },
  );
  assert.equal(thrown.ok, false);
  assert.match(thrown.message, /未获客户允许/);
  assert.match(thrown.message, /不要假设已批准/);

  const malformed: ShellEscalationFn = async () => null as unknown as { ok: boolean; message: string };
  const malformedResult = await handlerOf(toolsFor(allow, { shellGate: allowShellGate, shellEscalation: malformed }), TOOL)(
    { name: TOOL, args: { command: "npm install left-pad" } },
  );
  assert.equal(malformedResult.ok, false);
  assert.match(malformedResult.message, /未返回明确结果/);
  assert.match(malformedResult.message, /未获客户允许/);
  assert.equal(malformedResult.message.includes("已获批准"), false, "不得声称已获批准");
});

test("A1/AC-01：run_shell 与 start_background_task 在 ShellReviewRequest 中填 entry（拒绝⇒零 spawn）", async () => {
  const seen: ShellReviewRequest[] = [];
  const gate: ShellGate = async (req) => {
    seen.push(req);
    return { allow: false, reason: "fixture stops after review", by: "fixture" };
  };
  const fake = fakeSpawner();
  const manager = createBackgroundTaskManager({ spawnImpl: fake.spawnImpl, killTreeImpl: closeOnKill() });
  try {
    const tools = toolsFor(allow, { shellGate: gate, backgroundTasks: manager, shellCwd: process.cwd() });
    const foreground = await handlerOf(tools, "run_shell")({ name: "run_shell", args: { command: "echo hi" } });
    const background = await handlerOf(tools, "start_background_task")({ name: "start_background_task", args: { command: "echo hi" } });
    assert.equal(foreground.ok, false);
    assert.equal(background.ok, false);
    assert.deepEqual(seen.map((req) => req.entry), ["run_shell", "start_background_task"]);
    assert.equal(fake.spawnCalls(), 0, "审核拒绝 ⇒ 零 spawn");
  } finally {
    await manager.dispose();
  }
});

test("A1：run_shell 的执行后写审计请求同样携带 entry=run_shell", async () => {
  const postAuditRequests: ShellReviewRequest[] = [];
  const handler = handlerOf(
    toolsFor(allow, {
      shellGate: allowShellGate,
      shellCwd: process.cwd(),
      shellPostAudit: (req) => { postAuditRequests.push(req); return { violations: [] }; },
    }),
    "run_shell",
  );
  const result = await handler({ name: "run_shell", args: { command: `${process.execPath} -e 'process.stdout.write("ok")'` } });
  assert.equal(result.ok, true, result.message);
  assert.equal(postAuditRequests.length, 1);
  assert.equal(postAuditRequests[0].entry, "run_shell");
});

test("A1/§6.3：授权放行结果按 grant 附「客户已允许一次/本会话」说明；无 grant 时文案不含授权说明", async () => {
  const exec = async (gate: ShellGate) =>
    handlerOf(toolsFor(allow, { shellGate: gate, shellCwd: process.cwd() }), "run_shell")({
      name: "run_shell",
      args: { command: `${process.execPath} -e 'process.stdout.write("ok")'` },
    });

  const once = await exec(async () => ({
    allow: true,
    by: "customer:op-1（grant:req-1）",
    grant: { scope: "once", requestId: "req-1", operatorId: "op-1" },
  }));
  assert.equal(once.ok, true, once.message);
  assert.match(once.message, /客户升级授权/);
  assert.match(once.message, /客户已允许一次/);
  assert.match(once.message, /allow-once/);
  assert.match(once.message, /req-1/);

  const session = await exec(async () => ({
    allow: true,
    by: "customer:op-2（grant:req-2）",
    grant: { scope: "session", requestId: "req-2", operatorId: "op-2" },
  }));
  assert.equal(session.ok, true, session.message);
  assert.match(session.message, /客户已允许本会话/);
  assert.match(session.message, /allow-session/);
  assert.match(session.message, /req-2/);

  const plain = await exec(async () => ({ allow: true, by: "judge:claude" }));
  assert.equal(plain.ok, true, plain.message);
  assert.doesNotMatch(plain.message, /客户升级授权/);
});

test("A1/AC-03：schema 只含 command + 可选 necessity，不暴露 argv/授权字段；说明含精确命令/每会话一次/不执行", () => {
  const described = describeTool(TOOL);
  const parameters = described.parameters as {
    type: string;
    properties: Record<string, { type?: string; maxLength?: number }>;
    required: string[];
    additionalProperties: boolean;
  };
  assert.equal(parameters.type, "object");
  assert.deepEqual(Object.keys(parameters.properties).sort(), ["command", "necessity"]);
  assert.deepEqual(parameters.required, ["command"]);
  assert.equal(parameters.additionalProperties, false);
  assert.equal(parameters.properties.command.type, "string");
  assert.equal(parameters.properties.necessity.maxLength, 500);
  for (const forbidden of ["argv", "grant", "requestId", "operatorId", "scope"]) {
    assert.equal(forbidden in parameters.properties, false, `schema 不得暴露 ${forbidden}`);
  }
  assert.match(described.description, /每角色会话最多申请一次/);
  assert.match(described.description, /不执行命令/);
  assert.match(described.description, /申请≠批准/);
  assert.ok(described.promptGuidelines !== undefined && described.promptGuidelines.length > 0);
});

test("E2 R2：ShellEscalationDecision 增 pending 支（reason 可选）；既有三支形状不变", () => {
  const pending: ShellEscalationDecision = { action: "pending" };
  const pendingWithReason: ShellEscalationDecision = { action: "pending", reason: "已有待答 shell 卡（审批/升级），稍后再申请" };
  const allowOnce: ShellEscalationDecision = { action: "allow-once", operatorId: "op-1" };
  const allowSession: ShellEscalationDecision = { action: "allow-session" };
  const deny: ShellEscalationDecision = { action: "deny", operatorId: "op-1" };
  const expired: ShellEscalationDecision = { action: "expired", reason: "timeout" };
  const unavailable: ShellEscalationDecision = { action: "unavailable" };
  assert.equal(pending.action, "pending");
  assert.equal(pendingWithReason.action, "pending");
  assert.equal(pendingWithReason.action === "pending" ? pendingWithReason.reason : undefined, "已有待答 shell 卡（审批/升级），稍后再申请");
  assert.equal(allowOnce.action, "allow-once");
  assert.equal(allowOnce.action === "allow-once" ? allowOnce.operatorId : undefined, "op-1");
  assert.equal(allowSession.action, "allow-session");
  assert.equal(deny.action, "deny");
  assert.equal(expired.action, "expired");
  assert.equal(unavailable.action, "unavailable");
  // pending 不是三选一决定、不带 operatorId；只表达「呈现端当前无法受理」，不得据此放行。
  assert.equal("operatorId" in pending, false);
});

test("A1：模型加法字段兼容——旧形状原样可用，新字段按 §6.3/§7.1 契约接受", () => {
  const oldAllow: ShellReviewResult = { allow: true, by: "fixture" };
  const oldDeny: ShellReviewResult = { allow: false, reason: "denied", by: "fixture" };
  const oldRequest: ShellReviewRequest = { command: "ls", argv: ["ls"], cwd: "/tmp", toolCallId: "t" };
  const withEntry: ShellReviewRequest = { ...oldRequest, entry: "start_background_task" };
  const auditOld: ShellJudgeAudit = { engine: "claude", verdict: "allow", reasonCode: "ok" };
  const auditRetryCapped: ShellJudgeAudit = {
    engine: "claude",
    verdict: "deny",
    reasonCode: "retry-capped",
    modelVerdict: "manual",
    manualAsDeny: true,
  };
  const grant: ShellGrant = { scope: "session", requestId: "req-1", operatorId: "op-1" };
  const granted: ShellReviewResult = { allow: true, by: "customer:op-1（grant:req-1）", grant };
  const card: ShellEscalationCardRequest = {
    version: 1,
    requestId: "req-1",
    roleId: "runtime-core",
    projectRoot: "/project",
    runtime: "demo",
    command: "npm install left-pad",
    argv: ["npm", "install", "left-pad"],
    cwd: "/project",
    necessity: "构建必需",
  };
  const decision: ShellEscalationDecision = { action: "allow-once", operatorId: "op-1" };
  const expired: ShellEscalationDecision = { action: "expired", reason: "timeout" };
  const present: ShellEscalationPresentFn = async () => decision;

  assert.equal(oldAllow.by, "fixture");
  assert.equal(oldAllow.grant, undefined);
  assert.equal(oldDeny.allow, false);
  assert.equal(oldRequest.entry, undefined);
  assert.equal(withEntry.entry, "start_background_task");
  assert.equal(auditOld.manualAsDeny, undefined);
  assert.equal(auditRetryCapped.manualAsDeny, true);
  assert.equal(granted.allow === true ? granted.grant?.scope : undefined, "session");
  assert.equal(card.version, 1);
  assert.equal(decision.action, "allow-once");
  assert.equal(expired.action, "expired");
  assert.equal(typeof present, "function");
});
