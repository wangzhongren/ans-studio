// test/测试/shell-escalation-integration.test.ts
// 任务 `2026-10-31-shell-deny-customer-escalation`（T3）——D1 跨层集成（V1 AC-26；覆盖 AC-01/AC-02/
// AC-03/AC-07/AC-08/AC-12/AC-13/AC-14/AC-17/AC-19/AC-20/AC-22/AC-33 的跨层证据面）。
//
// 跨层口径（不启动真实 Electron / 不触真实模型 / 不联网）：真实 `openRoleSession` / `assembleProjectShellGate` /
// `assembleOperatorShellGate` / `assembleReadonlyShellGate` / `buildShellGate` / `buildGovernedTools` /
// 门禁引擎 `classifyShell`（经 Service 公开出口）+ 真实 shell 写目标守卫；只注入替身：升级卡 presenter、
// 操作者/判断通道（返回带 `judge` 审计的判拒）、内存审计 sink、临时项目。
//
// 覆盖矩阵（任务 D1 第 1 项）：
//   A. 判拒→申请→三选项→原样重试→授权消费→审计 customerGrant（真实工具注册 + 真实 run_shell 执行）；
//   B. allow-once 原子消费/第二次回正常链；allow-session；deny；expired；
//   C. 限流 5/1（会话总上限 5、同时 1 张待答）与旧记录清理；
//   D. entry=run_shell 与后台入口负例（不写入/不清除/不消费）；
//   E. 脚本上下文 sha256 stale；
//   F. 只读档裁定 A（routine ⇒ readonly-deny；构造期禁止 takeGrant；只读拒绝不消费既有授权）；
//   G. 白名单形态在项目角色/内置审批档 judge 调用计数=0；npm install 仍走既有判断；
//   H. 审计四类可区分（judge 放行 / 客户手批 / 客户升级授权 / escalation-decision；deny 档 tier+hardDenyOverride）；
//   I. c=allow 不消费一次性授权、c=deny 不消费/不放行；
//   J. 暂停语义（createShellSessionPauseState shell-only、非法输入不改状态；治理 approval 组不被暂停影响，
//      按 app/main.ts 现有代码事实断言）。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { ShellClass, ShellRules } from "../../src/model/decision.ts";
import type {
  OperatorChannelFn,
  OperatorOutcome,
  OperatorPrompt,
  RoleSession,
  RuntimeAdapter,
  ShellApprovalContext,
  ShellEscalationCardRequest,
  ShellEscalationDecision,
  ShellEscalationPresentFn,
  ShellJudgeAudit,
  ShellReviewRequest,
  WriteGate,
} from "../../src/model/runtime.ts";
import { openRoleSession, type AdapterCapabilities, type RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import {
  assembleOperatorShellGate,
  assembleProjectShellGate,
  assembleReadonlyShellGate,
} from "../../src/pipeline/orchestration/shell-arming.ts";
import {
  BRANCH_C_ALLOW,
  BRANCH_CUSTOMER_ESCALATION_ALLOW_ONCE,
  BRANCH_CUSTOMER_ESCALATION_ALLOW_SESSION,
  BRANCH_CUSTOMER_ESCALATION_STALE,
  BRANCH_READONLY_DENY,
  buildShellGate,
  createShellGate,
  type ClassifyShellFn,
} from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink, type ShellAuditRecord } from "../../src/common/编排/shell-audit.ts";
import {
  BRANCH_ESCALATION_GRANTED_ONCE,
  createShellEscalationSession,
  type ShellEscalationRuntimeOptions,
  type ShellEscalationSession,
} from "../../src/common/编排/shell-escalation.ts";
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
import { evaluateShellWriteTargets } from "../../src/common/门禁引擎/shell-write-guard.ts";
import { buildGovernedTools, REQUEST_SHELL_ESCALATION_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import { createShellJudgeSwitch, createShellSessionPauseState } from "../../app/desktop/interface.ts";
import { shellJudgeResultView } from "../../app/renderer/src/chat/judge.ts";
import { DEFAULT_LOCALE, translate } from "../../src/common/shared/i18n/index.ts";

const ROLE = "X";
const NOW = new Date("2026-10-31T15:00:00.000Z");
const EMPTY_RULES: ShellRules = { version: "1", readOnly: [], hardDenyPrograms: [], denyTokens: [] };

function judgeDenyAudit(over: Partial<ShellJudgeAudit> = {}): ShellJudgeAudit {
  return {
    engine: "pi",
    verdict: "deny",
    reasonCode: "model-deny",
    reason: "该命令可能破坏工作区",
    customerMessage: "自动代理未放行该命令。",
    alternative: { kind: "command", value: "npm run typecheck" },
    ...over,
  };
}

function reqOf(argv: string[], over: Partial<ShellReviewRequest> = {}): ShellReviewRequest {
  return {
    command: argv.join(" "),
    argv,
    cwd: over.cwd ?? "/fixture-proj",
    toolCallId: "it-call-1",
    entry: "run_shell",
    ...over,
  };
}

// —————————————————————— 夹具 ——————————————————————

interface TempProject {
  root: string;
  project: ProjectConfig;
  cleanup(): void;
}

/** 临时项目：项目角色 X（role-card + boundary）+ 已接受治理边界；不触真实用户目录。 */
function makeTempProject(): TempProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shell-escalation-it-"));
  const roleDir = path.join(root, "角色卡", "X");
  fs.mkdirSync(roleDir, { recursive: true });
  fs.writeFileSync(path.join(roleDir, "role-card.md"), "# X\n\n跨层集成临时角色。\n", "utf8");
  fs.writeFileSync(
    path.join(roleDir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: fixture\n",
    "utf8",
  );
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "x.ts"), "export const x = 1;\n", "utf8");
  return {
    root,
    project: {
      projectRoot: root,
      skillRoot: root,
      roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
      builtInRoles: ["su"],
      governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "fixture" } },
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** 真实 shell 写目标守卫（与生产同源）；checkWrite 放行以隔离本测试关注点（判定顺序/白名单）。 */
function realWriteGuard(project: ProjectConfig) {
  return (req: ShellReviewRequest) =>
    evaluateShellWriteTargets({
      argv: req.argv,
      cwd: req.cwd,
      projectRoot: project.projectRoot,
      skillRoot: project.skillRoot,
      boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
      forbiddenPrefixes: [],
      checkWrite: () => ({ allowed: true }),
    });
}

/** 操作者/判断通道替身（计数器 + 脚本化结果）。 */
function operatorDouble(outcome: OperatorOutcome | (() => Promise<OperatorOutcome>)): {
  fn: OperatorChannelFn;
  calls: OperatorPrompt[];
} {
  const calls: OperatorPrompt[] = [];
  const fn: OperatorChannelFn = async (prompt) => {
    calls.push(prompt);
    return typeof outcome === "function" ? await outcome() : outcome;
  };
  return { fn, calls };
}

/** 按调用顺序返回结果的判断通道替身（用尽后重复最后一项）。 */
function sequencedOperator(outcomes: OperatorOutcome[]): { fn: OperatorChannelFn; calls: OperatorPrompt[] } {
  const calls: OperatorPrompt[] = [];
  let index = 0;
  const fn: OperatorChannelFn = async (prompt) => {
    calls.push(prompt);
    const next = outcomes[Math.min(index, outcomes.length - 1)]!;
    index += 1;
    return next;
  };
  return { fn, calls };
}

/** 升级卡 presenter 替身（记卡 + 脚本化决定；用尽后默认 expired = 拒绝）。 */
function presenterDouble(decisions: Array<ShellEscalationDecision | (() => Promise<ShellEscalationDecision>)>): {
  fn: ShellEscalationPresentFn;
  cards: ShellEscalationCardRequest[];
} {
  const cards: ShellEscalationCardRequest[] = [];
  let index = 0;
  const fn: ShellEscalationPresentFn = async (card) => {
    cards.push(card);
    const next = decisions[Math.min(index, decisions.length - 1)] ?? { action: "expired" };
    index += 1;
    return typeof next === "function" ? await next() : next;
  };
  return { fn, cards };
}

/** 捕获能力面的适配器桩（同 B1 夹具形状；不启动任何真实运行时）。 */
function captureAdapter(): { factory: RuntimeAdapterFactory; caps(): AdapterCapabilities | undefined } {
  let captured: AdapterCapabilities | undefined;
  const factory: RuntimeAdapterFactory = (_gate, capabilities) => {
    captured = capabilities;
    const adapter: RuntimeAdapter = {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return {
          async prompt() {},
          events(): AsyncIterable<never> {
            return (async function* () {})();
          },
          async dispose() {},
        } as unknown as RoleSession;
      },
    };
    return adapter;
  };
  return { factory, caps: () => captured };
}

interface OpenSessionOptions {
  project: ProjectConfig;
  operator: OperatorChannelFn;
  presenter: ShellEscalationPresentFn;
  audit: ReturnType<typeof createMemoryAuditSink>;
  classifyShellFn?: ClassifyShellFn;
  escalationOptions?: ShellEscalationRuntimeOptions;
}

interface OpenedSession {
  caps: AdapterCapabilities;
  dispose(): Promise<void>;
}

/** 真实 `openRoleSession`（项目角色三层链；registry/presenter/审计接线全真实）。 */
async function openSession(opts: OpenSessionOptions): Promise<OpenedSession> {
  const adapter = captureAdapter();
  const handle = await openRoleSession(
    {
      roleId: ROLE,
      project: opts.project,
      runtime: "pi",
      shellOperatorChannel: opts.operator,
      shellArming: {
        classifyShell: opts.classifyShellFn ?? classifyShell,
        rules: opts.classifyShellFn !== undefined ? EMPTY_RULES : defaultShellRules(),
        auditSink: opts.audit,
        timeoutMs: 5000,
        env: {},
      },
      shellEscalationPresenter: opts.presenter,
      shellEscalationOptions: { now: () => NOW, presentTimeoutMs: 2000, env: {}, ...(opts.escalationOptions ?? {}) },
    },
    { createAdapter: adapter.factory },
  );
  const caps = adapter.caps();
  assert.ok(caps !== undefined && typeof caps.shellGate === "function", "shell 必须已 arm");
  return { caps, dispose: () => handle.dispose() };
}

const denyWrites: WriteGate = () => ({ allowed: false, reason: "fixture 无写能力", allowedByRoot: { project: [], skill: [] } });

function toolsOf(caps: AdapterCapabilities, shellCwd?: string) {
  const options = {
    shellGate: caps.shellGate!,
    ...(caps.shellEscalation !== undefined ? { shellEscalation: caps.shellEscalation } : {}),
    ...(shellCwd !== undefined ? { shellCwd } : {}),
  };
  return new Map(buildGovernedTools(denyWrites, options).map((tool) => [tool.name, tool] as const));
}

function reviewRecords(audit: ReturnType<typeof createMemoryAuditSink>): ShellAuditRecord[] {
  return audit.records.filter((record) => record.event === undefined || record.event === "review");
}

function escalationRecords(audit: ReturnType<typeof createMemoryAuditSink>): ShellAuditRecord[] {
  return audit.records.filter((record) => record.event === "escalation-decision");
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

const judgeDenyOutcome = (): OperatorOutcome => ({
  outcome: "deny",
  operatorId: "judge:pi",
  reason: "判拒",
  judge: judgeDenyAudit(),
});

// —————————————————————— A. 端到端：判拒→申请→三选项→原样重试→授权消费→审计 ——————————————————————

test("A/AC-26：真实工具注册 + 判拒→申请→allow-once→原样重试执行→二次回正常链；审计 customerGrant 与 escalation-decision", async () => {
  const fx = makeTempProject();
  const audit = createMemoryAuditSink();
  const operator = operatorDouble(judgeDenyOutcome());
  const presenter = presenterDouble([{ action: "allow-once", operatorId: "cust-1" }]);
  const session = await openSession({ project: fx.project, operator: operator.fn, presenter: presenter.fn, audit });
  try {
    const caps = session.caps;
    // 真实工具面：shell 已 arm + 能力注入 ⇒ run_shell 与 request_shell_escalation 都注册。
    const tools = toolsOf(caps, fx.root);
    assert.ok(tools.has("run_shell"));
    assert.ok(tools.has(REQUEST_SHELL_ESCALATION_TOOL_NAME), "注入能力 ⇒ 申请工具注册");
    // 能力缺席（只 arm shell、未注入 shellEscalation）⇒ 申请工具不注册（fail-closed）。
    const withoutEscalation = new Map(
      buildGovernedTools(denyWrites, { shellGate: caps.shellGate, shellCwd: fx.root }).map((tool) => [tool.name, tool] as const),
    );
    assert.equal(withoutEscalation.has(REQUEST_SHELL_ESCALATION_TOOL_NAME), false);

    // 短内联 node -e：真实写守卫判 script（进入脚本上下文审查）；判拒记录必须携带上下文。
    const command = `${process.execPath} -e 'process.stdout.write("granted")'`;
    const first = await tools.get("run_shell")!.handler({ name: "run_shell", args: { command }, toolCallId: "it-run-1" });
    assert.equal(first.ok, false, "judge 判拒 ⇒ 未执行");
    assert.match(first.message, /审核拒绝/);
    assert.equal(operator.calls.length, 1);

    const request = await tools.get(REQUEST_SHELL_ESCALATION_TOOL_NAME)!.handler({
      name: REQUEST_SHELL_ESCALATION_TOOL_NAME,
      args: { command, necessity: "推进任务需要该检查" },
      toolCallId: "it-esc-1",
    });
    assert.equal(request.ok, true, request.message);
    assert.match(request.message, /仅此一次/);
    assert.equal(presenter.cards.length, 1);
    const card = presenter.cards[0]!;
    const requestId = card.requestId;
    assert.match(requestId, /\S+/, "卡请求携带 requestId");
    assert.equal(card.command, command, "卡上命令逐字取自判拒记录");
    assert.equal(card.cwd, fx.root);
    assert.equal(card.necessity, "推进任务需要该检查");
    assert.equal(card.judgeReason, judgeDenyAudit().reason);
    assert.ok(card.approvalContext !== undefined, "script 判拒记录必须携带脚本上下文");

    // 原样重试：闸经 takeGrant 放行并真实执行（唯一 spawn 点在审核返回 allow 之后）。
    const granted = await tools.get("run_shell")!.handler({ name: "run_shell", args: { command }, toolCallId: "it-run-2" });
    assert.equal(granted.ok, true, granted.message);
    assert.match(granted.message, /客户升级授权/);
    assert.match(granted.message, /客户已允许一次/);
    assert.match(granted.message, /granted/, "命令真实执行并返回输出");
    assert.equal(operator.calls.length, 1, "授权放行不经过判断通道");

    // 第二次同命令：一次性授权已消费 ⇒ 回正常链（再次调用判断通道），并被判拒。
    const second = await tools.get("run_shell")!.handler({ name: "run_shell", args: { command }, toolCallId: "it-run-3" });
    assert.equal(second.ok, false, "once 只放行一次");
    assert.match(second.message, /审核拒绝/);
    assert.equal(operator.calls.length, 2, "第二次回到正常审核链");

    // 同命令不可再次申请（consumed 终态），不弹第二张卡。
    const again = await tools.get(REQUEST_SHELL_ESCALATION_TOOL_NAME)!.handler({
      name: REQUEST_SHELL_ESCALATION_TOOL_NAME,
      args: { command },
      toolCallId: "it-esc-2",
    });
    assert.equal(again.ok, false);
    assert.match(again.message, /不再受理同一命令的申请/);
    assert.equal(presenter.cards.length, 1, "不弹第二张卡");

    // 审计：客户升级授权放行 review（customerGrant、无 judge、独立 branch/by）与同 sink 的申请决定记录。
    const grantedReview = reviewRecords(audit).find((record) => record.customerGrant !== undefined);
    assert.ok(grantedReview !== undefined, "必须存在 customerGrant review 记录");
    assert.deepEqual(grantedReview.customerGrant, { requestId, scope: "once", operatorId: "cust-1" });
    assert.equal(grantedReview.judge, undefined, "客户升级授权放行不写 judge");
    assert.equal(grantedReview.branch, BRANCH_CUSTOMER_ESCALATION_ALLOW_ONCE);
    assert.match(grantedReview.by, new RegExp(`^customer:cust-1（grant:${requestId}）$`));
    assert.equal(grantedReview.entry, "run_shell");
    const decisions = escalationRecords(audit);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0]!.branch, BRANCH_ESCALATION_GRANTED_ONCE);
    assert.equal(decisions[0]!.conclusion, "allow");
    assert.equal(decisions[0]!.execution, "未执行");
    assert.deepEqual(decisions[0]!.conditions, ["shell-gate"]);
    assert.deepEqual(decisions[0]!.escalation, { requestId, action: "allow-once", roleId: ROLE });
    // 首次判拒 review 记录仍归 judge（与客户授权区分）。
    const judgeReview = reviewRecords(audit).find((record) => record.judge?.verdict === "deny");
    assert.ok(judgeReview !== undefined);
    assert.equal(judgeReview.customerGrant, undefined);
  } finally {
    await session.dispose();
    fx.cleanup();
  }
});

test("A2/AC-07：allow-session 原样重试可反复执行；会话 dispose 后授权失效（fail-closed）", async () => {
  const fx = makeTempProject();
  const audit = createMemoryAuditSink();
  const operator = operatorDouble(judgeDenyOutcome());
  const presenter = presenterDouble([{ action: "allow-session", operatorId: "cust-2" }]);
  const session = await openSession({ project: fx.project, operator: operator.fn, presenter: presenter.fn, audit });
  try {
    const caps = session.caps;
    const command = `${process.execPath} -e 'process.stdout.write("session-ok")'`;
    const tools = toolsOf(caps, fx.root);
    const denied = await tools.get("run_shell")!.handler({ name: "run_shell", args: { command }, toolCallId: "s1" });
    assert.equal(denied.ok, false);
    const request = await tools.get(REQUEST_SHELL_ESCALATION_TOOL_NAME)!.handler({
      name: REQUEST_SHELL_ESCALATION_TOOL_NAME,
      args: { command },
      toolCallId: "s2",
    });
    assert.equal(request.ok, true, request.message);
    const first = await tools.get("run_shell")!.handler({ name: "run_shell", args: { command }, toolCallId: "s3" });
    const second = await tools.get("run_shell")!.handler({ name: "run_shell", args: { command }, toolCallId: "s4" });
    assert.equal(first.ok, true, first.message);
    assert.equal(second.ok, true, second.message);
    assert.equal(operator.calls.length, 1, "会话授权不再经过判断通道");
    const grants = reviewRecords(audit).filter((record) => record.customerGrant !== undefined);
    assert.equal(grants.length, 2);
    for (const record of grants) {
      assert.equal(record.customerGrant?.scope, "session");
      assert.equal(record.branch, BRANCH_CUSTOMER_ESCALATION_ALLOW_SESSION);
    }
    await session.dispose();
    // dispose 后授权失效 ⇒ 回正常链（判断通道再次被调用），不再放行。
    const afterDispose = await caps.shellGate!(reqOf(["mysterytool", "--after-dispose"], { cwd: fx.root }));
    assert.equal(afterDispose.allow, false);
    assert.equal(operator.calls.length, 2);
  } finally {
    await session.dispose();
    fx.cleanup();
  }
});

// —————————————————————— B. 客户拒绝 / 超时（expired） ——————————————————————

test("B/AC-05/AC-06：客户拒绝与超时（expired）均按未获允许处理；回执如实、不可再申请、原样重试仍回正常链", async () => {
  for (const item of [
    { label: "deny", decision: { action: "deny", operatorId: "cust-3" } as ShellEscalationDecision, pattern: /未获客户允许/ },
    { label: "expired", decision: { action: "expired" } as ShellEscalationDecision, pattern: /未获客户允许/ },
  ]) {
    const fx = makeTempProject();
    const audit = createMemoryAuditSink();
    const operator = operatorDouble(judgeDenyOutcome());
    const presenter = presenterDouble([item.decision]);
    const session = await openSession({ project: fx.project, operator: operator.fn, presenter: presenter.fn, audit });
    try {
      const caps = session.caps;
      const tools = toolsOf(caps, fx.root);
      const argv = ["mysterytool", `--${item.label}`];
      assert.equal((await caps.shellGate!(reqOf(argv, { cwd: fx.root }))).allow, false, item.label);
      const receipt = await caps.shellEscalation!({ command: argv.join(" "), argv });
      assert.equal(receipt.ok, false, item.label);
      assert.match(receipt.message, item.pattern, item.label);
      assert.equal(presenter.cards.length, 1, `${item.label}：出过一张卡`);
      const again = await tools.get(REQUEST_SHELL_ESCALATION_TOOL_NAME)!.handler({
        name: REQUEST_SHELL_ESCALATION_TOOL_NAME,
        args: { command: argv.join(" ") },
        toolCallId: `esc-${item.label}-2`,
      });
      assert.equal(again.ok, false, item.label);
      assert.match(again.message, /不再受理同一命令/, item.label);
      assert.equal(presenter.cards.length, 1, `${item.label}：不弹第二张卡`);
      // 原样重试没有被授权 ⇒ 回正常链（判断通道第二次被调用）并拒绝。
      assert.equal((await caps.shellGate!(reqOf(argv, { cwd: fx.root }))).allow, false, item.label);
      assert.equal(operator.calls.length, 2, `${item.label}：重试回正常链`);
    } finally {
      await session.dispose();
      fx.cleanup();
    }
  }
});

// —————————————————————— C. 限流 5/1 与旧记录清理 ——————————————————————

test("C/AC-08：会话总上限 5——第 6 次拒绝且不弹卡；同时最多 1 张待答（不排队、不消耗申请权）", async () => {
  const fx = makeTempProject();
  const audit = createMemoryAuditSink();
  const operator = operatorDouble(judgeDenyOutcome());
  const presenter = presenterDouble([
    { action: "deny" },
    { action: "deny" },
    { action: "deny" },
    { action: "deny" },
    { action: "deny" },
  ]);
  const session = await openSession({
    project: fx.project,
    operator: operator.fn,
    presenter: presenter.fn,
    audit,
    escalationOptions: { maxRequestsPerSession: 5 },
  });
  try {
    const caps = session.caps;
    const requestTool = toolsOf(caps).get(REQUEST_SHELL_ESCALATION_TOOL_NAME)!;
    for (let i = 0; i < 5; i += 1) {
      const argv = ["mysterytool", `--limit-${i}`];
      assert.equal((await caps.shellGate!(reqOf(argv, { cwd: fx.root }))).allow, false);
      const receipt = await requestTool.handler({
        name: REQUEST_SHELL_ESCALATION_TOOL_NAME,
        args: { command: argv.join(" ") },
        toolCallId: `limit-${i}`,
      });
      assert.equal(receipt.ok, false, `第 ${i + 1} 次由客户拒绝`);
      assert.match(receipt.message, /未获客户允许/);
    }
    assert.equal(presenter.cards.length, 5, "5 次额度全部实际呈现");
    const sixthArgv = ["mysterytool", "--limit-5"];
    assert.equal((await caps.shellGate!(reqOf(sixthArgv, { cwd: fx.root }))).allow, false);
    const capped = await requestTool.handler({
      name: REQUEST_SHELL_ESCALATION_TOOL_NAME,
      args: { command: sixthArgv.join(" ") },
      toolCallId: "limit-5",
    });
    assert.equal(capped.ok, false);
    assert.match(capped.message, /上限（5 次）/, "超限直接拒绝");
    assert.equal(presenter.cards.length, 5, "超限不弹卡");
  } finally {
    await session.dispose();
    fx.cleanup();
  }
});

test("C2/AC-08：同时最多 1 张待答卡——待答期间新申请直接拒绝且不消耗其申请权", async () => {
  const fx = makeTempProject();
  const audit = createMemoryAuditSink();
  const operator = operatorDouble(judgeDenyOutcome());
  const cards: ShellEscalationCardRequest[] = [];
  let resolveFirst: ((decision: ShellEscalationDecision) => void) | undefined;
  let hold = true;
  const presenter: ShellEscalationPresentFn = async (card) => {
    cards.push(card);
    if (hold) {
      hold = false;
      return await new Promise<ShellEscalationDecision>((resolve) => {
        resolveFirst = resolve;
      });
    }
    return { action: "deny" };
  };
  const session = await openSession({ project: fx.project, operator: operator.fn, presenter, audit });
  try {
    const caps = session.caps;
    const argvA = ["mysterytool", "--pending-a"];
    const argvB = ["mysterytool", "--pending-b"];
    assert.equal((await caps.shellGate!(reqOf(argvA, { cwd: fx.root }))).allow, false);
    assert.equal((await caps.shellGate!(reqOf(argvB, { cwd: fx.root }))).allow, false);
    const firstPromise = caps.shellEscalation!({ command: argvA.join(" "), argv: argvA });
    await waitFor(() => cards.length === 1, "第一张卡进入待答");
    const second = await caps.shellEscalation!({ command: argvB.join(" "), argv: argvB });
    assert.equal(second.ok, false);
    // E2 返工 R2（B1）：呈现前被拒与 presenter 返回 pending 共用稳定回执「当前有 pending shell 确认卡…」。
    assert.match(second.message, /pending shell 确认卡/);
    assert.match(second.message, /请稍后再申请/);
    assert.equal(cards.length, 1, "待答期间不弹第二张卡（不排队）");
    resolveFirst!({ action: "deny", operatorId: "cust-5" });
    const first = await firstPromise;
    assert.equal(first.ok, false);
    assert.match(first.message, /未获客户允许/);
    // 被 pending 拒绝的申请不消耗 B 的申请权：待答清除后可再次申请并出卡。
    const third = await caps.shellEscalation!({ command: argvB.join(" "), argv: argvB });
    assert.equal(third.ok, false);
    assert.match(third.message, /未获客户允许（客户拒绝）/);
    assert.equal(cards.length, 2, "B 的申请权未被 pending 拒绝消耗");
  } finally {
    await session.dispose();
    fx.cleanup();
  }
});

test("C3/AC-08：旧判拒记录在后续 allow 后立即清除 ⇒ 申请被拒（资格只认最近一次审核）", async () => {
  const fx = makeTempProject();
  const audit = createMemoryAuditSink();
  const operator = operatorDouble(judgeDenyOutcome());
  const presenter = presenterDouble([{ action: "deny" }]);
  let mode: ShellClass = "review";
  const classifyFn: ClassifyShellFn = () => ({ decision: mode, ruleId: `test:${mode}` });
  const session = await openSession({
    project: fx.project,
    operator: operator.fn,
    presenter: presenter.fn,
    audit,
    classifyShellFn: classifyFn,
  });
  try {
    const caps = session.caps;
    const argv = ["mysterytool", "--stale-record"];
    assert.equal((await caps.shellGate!(reqOf(argv, { cwd: fx.root }))).allow, false, "首次判拒");
    mode = "allow";
    assert.equal((await caps.shellGate!(reqOf(argv, { cwd: fx.root }))).allow, true, "后续审核 allow");
    const receipt = await caps.shellEscalation!({ command: argv.join(" "), argv });
    assert.equal(receipt.ok, false);
    assert.match(receipt.message, /未找到可申请的判拒记录/);
    assert.equal(presenter.cards.length, 0, "记录已清除 ⇒ 不弹卡");
  } finally {
    await session.dispose();
    fx.cleanup();
  }
});

// —————————————————————— D. entry=run_shell 与后台入口负例 ——————————————————————

test("D/AC-01/AC-02：start_background_task 判拒不写入/不清除 run_shell 台账、不消费 run_shell 授权", async () => {
  const fx = makeTempProject();
  const audit = createMemoryAuditSink();
  const operator = sequencedOperator([
    judgeDenyOutcome(), // 1) 前台判拒
    judgeDenyOutcome(), // 2) 后台判拒（同一命令）
    { outcome: "allow", operatorId: "judge:pi", judge: { engine: "pi", verdict: "allow", reasonCode: "ok", reason: "后台放行" } }, // 4) 后台 allow（不同命令）
    judgeDenyOutcome(), // 5) 前台判拒（第三命令）
    { outcome: "allow", operatorId: "judge:pi", judge: { engine: "pi", verdict: "allow", reasonCode: "ok", reason: "后台放行" } }, // 6) 后台 allow（第三命令）
  ]);
  const presenter = presenterDouble([{ action: "allow-once", operatorId: "cust-6" }, { action: "deny", operatorId: "cust-6" }]);
  const session = await openSession({ project: fx.project, operator: operator.fn, presenter: presenter.fn, audit });
  try {
    const caps = session.caps;
    const argvA = ["mysterytool", "--entry-a"];
    assert.equal((await caps.shellGate!(reqOf(argvA, { cwd: fx.root }))).allow, false);
    const request = await caps.shellEscalation!({ command: argvA.join(" "), argv: argvA });
    assert.equal(request.ok, true, request.message);
    assert.equal(presenter.cards.length, 1);
    // 后台入口同 argv：判断通道被调用并拒绝；不得消费前台一次性授权。
    const background = await caps.shellGate!(reqOf(argvA, { cwd: fx.root, entry: "start_background_task" }));
    assert.equal(background.allow, false);
    assert.equal(operator.calls.length, 2);
    const retry = await caps.shellGate!(reqOf(argvA, { cwd: fx.root }));
    assert.equal(retry.allow, true, "前台授权未被后台调用吃掉");
    // 后台判拒不写入可申请台账：同 argv 的后台记录不能用于申请。
    const argvB = ["mysterytool", "--entry-b"];
    assert.equal((await caps.shellGate!(reqOf(argvB, { cwd: fx.root, entry: "start_background_task" }))).allow, true);
    const bgOnly = await caps.shellEscalation!({ command: argvB.join(" "), argv: argvB });
    assert.equal(bgOnly.ok, false);
    assert.match(bgOnly.message, /未找到可申请的判拒记录/);
    // 后台 review 也不清除既有 run_shell recorded 记录：前台判拒 → 后台 allow → 申请仍可出卡。
    const argvC = ["mysterytool", "--entry-c"];
    assert.equal((await caps.shellGate!(reqOf(argvC, { cwd: fx.root }))).allow, false);
    assert.equal((await caps.shellGate!(reqOf(argvC, { cwd: fx.root, entry: "start_background_task" }))).allow, true);
    const receiptC = await caps.shellEscalation!({ command: argvC.join(" "), argv: argvC });
    assert.equal(receiptC.ok, false);
    assert.match(receiptC.message, /未获客户允许（客户拒绝）/, "记录未被后台 review 清除 ⇒ 申请出卡并被拒");
    assert.equal(presenter.cards.length, 2);
    // 审计区分入口。
    const reviews = reviewRecords(audit);
    assert.ok(reviews.some((record) => record.entry === "start_background_task"));
    assert.ok(reviews.some((record) => record.entry === "run_shell"));
    const grantReview = reviews.find((record) => record.customerGrant !== undefined);
    assert.equal(grantReview?.entry, "run_shell");
  } finally {
    await session.dispose();
    fx.cleanup();
  }
});

// —————————————————————— E. 脚本上下文 sha256 stale ——————————————————————

const contextOf = (sha: string): ShellApprovalContext => ({
  scripts: [{ label: "node 脚本", content: "console.log(1)", bytes: 14, sha256: sha }],
  scriptPaths: ["scripts/x.mjs"],
  note: "有界上下文",
});

interface StaleHarness {
  gate: ReturnType<typeof buildShellGate>;
  registry: ShellEscalationSession;
  operator: ReturnType<typeof operatorDouble>;
  presenter: ReturnType<typeof presenterDouble>;
  audit: ReturnType<typeof createMemoryAuditSink>;
  setContext(context: ShellApprovalContext): void;
}

/** `buildShellGate` + 真实 registry；writeGuard/loader 受控，用于脚本上下文时效。 */
function makeStaleHarness(root: string): StaleHarness {
  const audit = createMemoryAuditSink();
  const presenter = presenterDouble([{ action: "allow-once", operatorId: "cust-7" }]);
  const registry = createShellEscalationSession({
    roleId: ROLE,
    projectRoot: root,
    runtime: "pi",
    present: presenter.fn,
    now: () => NOW,
    presentTimeoutMs: 2000,
    idFactory: () => "req-1",
    env: {},
  });
  const operator = operatorDouble(judgeDenyOutcome());
  let context = contextOf("a".repeat(64));
  const gate = buildShellGate({
    projectRoot: root,
    skillRoot: root,
    pmBoundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    auditSink: audit,
    classifyShell: () => ({ decision: "review", ruleId: "test:review" }),
    rules: EMPTY_RULES,
    writeGuard: () => ({ kind: "script", reason: "fixture 脚本" }),
    approvalContextLoader: async () => ({ ok: true, context }),
    operatorChannel: operator.fn,
    timeoutMs: 5000,
    env: {},
    onReviewed: (req, outcome) => registry.recordReview(req, outcome),
    takeGrant: (req, ctx) => registry.takeGrant(req, ctx),
    onAuditSinkCreated: (sink) => registry.bindAudit(sink),
  });
  return { gate, registry, operator, presenter, audit, setContext: (next) => { context = next; } };
}

test("E/AC-07：脚本上下文 sha256 stale——授权作废、拒绝（customer-escalation:stale-context）、不可再申请", async () => {
  const root = path.join(os.tmpdir(), "ans-shell-escalation-stale-root");
  const h = makeStaleHarness(root);
  const argv = ["node", "scripts/x.mjs"];
  const first = await h.gate(reqOf(argv, { cwd: root }));
  assert.equal(first.allow, false);
  assert.equal(h.presenter.cards.length, 0, "判拒本身不自动弹卡");
  const receipt = await h.registry.request({ command: "node scripts/x.mjs", argv });
  assert.equal(receipt.ok, true, receipt.message);
  assert.equal(h.presenter.cards.length, 1);
  assert.deepEqual(h.presenter.cards[0]!.approvalContext, contextOf("a".repeat(64)), "卡上上下文 = 判拒时同一份");
  // 脚本内容在判拒后变化 ⇒ 客户批准的是旧内容，授权作废。
  h.setContext(contextOf("b".repeat(64)));
  const stale = await h.gate(reqOf(argv, { cwd: root }));
  assert.equal(stale.allow, false);
  assert.match(!stale.allow ? stale.reason : "", /stale-context/);
  const staleReview = reviewRecords(h.audit).find((record) => record.branch === BRANCH_CUSTOMER_ESCALATION_STALE);
  assert.ok(staleReview !== undefined, "拒绝审计使用稳定 stale 分支");
  assert.equal(staleReview.customerGrant, undefined);
  assert.equal(h.operator.calls.length, 1, "stale 判定不调用判断通道");
  // 授权已作废且记录终态：不可再申请；恢复旧内容也不能复活授权。
  const again = await h.registry.request({ command: "node scripts/x.mjs", argv });
  assert.equal(again.ok, false);
  assert.match(again.message, /不再受理同一命令/);
  assert.equal(h.presenter.cards.length, 1);
  h.setContext(contextOf("a".repeat(64)));
  const retry = await h.gate(reqOf(argv, { cwd: root }));
  assert.equal(retry.allow, false, "stale 后授权不可复活");
  assert.equal(h.operator.calls.length, 2, "回正常审核链");
});

// —————————————————————— F. 只读档裁定 A ——————————————————————

test("F/AC-02/AC-12/AC-13：只读档不适用例行白名单——routine ⇒ readonly-deny（不调 operator/不弹卡），非 routine c-allow 仍放行", async () => {
  const fx = makeTempProject();
  const audit = createMemoryAuditSink();
  const gate = await assembleReadonlyShellGate({
    project: fx.project,
    classifyShell,
    rules: defaultShellRules(),
    auditSink: audit,
    writeGuard: realWriteGuard(fx.project),
    timeoutMs: 5000,
    env: {},
  });
  const routineCases: Array<{ argv: string[]; tier: "review" | "risky" }> = [
    { argv: ["npm", "test"], tier: "risky" },
    { argv: ["npm", "ci"], tier: "risky" },
    { argv: ["npm", "run", "lint"], tier: "risky" },
    { argv: ["node", "--test"], tier: "review" },
    { argv: ["tsc", "--noEmit"], tier: "review" },
  ];
  for (const item of routineCases) {
    const result = await gate(reqOf(item.argv, { cwd: fx.root }));
    assert.equal(result.allow, false, `只读档必须拒绝：${item.argv.join(" ")}`);
    if (!result.allow) assert.match(result.reason, new RegExp(`\\(c\\) 判为 ${item.tier}`), item.argv.join(" "));
    assert.equal(audit.records.at(-1)!.branch, BRANCH_READONLY_DENY, item.argv.join(" "));
  }
  // 非 routine 的 (c) 白名单（只读命令）仍按 c-allow 放行。
  const readOnly = await gate(reqOf(["ls", "-la"], { cwd: fx.root }));
  assert.equal(readOnly.allow, true);
  assert.equal(audit.records.at(-1)!.branch, BRANCH_C_ALLOW);
  // 只读档从不调用操作者/升级 presenter（选项面没有这些通道；行为上也没有卡）。
  assert.ok(audit.records.every((record) => record.judge === undefined && record.customerGrant === undefined));
});

test("F2/AC-02：readonlyOnly 构造期禁止注入 takeGrant；只读拒绝不消费既有 run_shell 授权", async () => {
  assert.throws(
    () =>
      createShellGate({
        rules: EMPTY_RULES,
        audit: createMemoryAuditSink(),
        classifyShell: () => "allow",
        readonlyOnly: true,
        takeGrant: () => undefined,
      }),
    /readonlyOnly 不得注入 takeGrant/,
  );

  const root = path.join(os.tmpdir(), "ans-shell-escalation-readonly-grant-root");
  const audit = createMemoryAuditSink();
  const presenter = presenterDouble([{ action: "allow-once", operatorId: "cust-8" }]);
  const registry = createShellEscalationSession({
    roleId: ROLE,
    projectRoot: root,
    runtime: "pi",
    present: presenter.fn,
    now: () => NOW,
    presentTimeoutMs: 2000,
    idFactory: () => "req-1",
    env: {},
  });
  registry.bindAudit(createMemoryAuditSink());
  const argv = ["node", "--test"];
  // 模拟一次 run_shell 判拒并取得 allow-once（registry 层；与闸路径解耦以聚焦只读边界）。
  registry.recordReview(reqOf(argv, { cwd: root }), {
    result: { allow: false, reason: "拒绝", by: "operator:judge" },
    conclusion: "deny",
    branch: "c-review→a-deny",
    judge: judgeDenyAudit(),
  });
  assert.equal((await registry.request({ command: "node --test", argv })).ok, true);

  // 真实只读装配：routine 命令被拒绝（readonly-deny），并且不可能接触 takeGrant（选项面/构造期双重保证）。
  const fx = makeTempProject();
  try {
    const readonlyGate = await assembleReadonlyShellGate({
      project: fx.project,
      classifyShell,
      rules: defaultShellRules(),
      auditSink: createMemoryAuditSink(),
      writeGuard: realWriteGuard(fx.project),
      timeoutMs: 5000,
      env: {},
    });
    const denied = await readonlyGate(reqOf(argv, { cwd: root }));
    assert.equal(denied.allow, false);
    assert.equal((await readonlyGate(reqOf(argv, { cwd: root }))).allow, false, "重复调用同样拒绝");
  } finally {
    fx.cleanup();
  }

  // 既有 run_shell 授权未被只读拒绝消费：正常闸启用 takeGrant 时仍能消费（一次）。
  const normalGate = buildShellGate({
    projectRoot: root,
    skillRoot: root,
    pmBoundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    auditSink: audit,
    classifyShell: () => ({ decision: "review", ruleId: "test:review" }),
    rules: EMPTY_RULES,
    operatorChannel: operatorDouble(judgeDenyOutcome()).fn,
    timeoutMs: 5000,
    env: {},
    onReviewed: (req, outcome) => registry.recordReview(req, outcome),
    takeGrant: (req, ctx) => registry.takeGrant(req, ctx),
    onAuditSinkCreated: (sink) => registry.bindAudit(sink),
  });
  const granted = await normalGate(reqOf(argv, { cwd: root }));
  assert.equal(granted.allow, true, "只读拒绝没有吃掉既有授权");
  if (granted.allow) assert.equal(granted.grant?.scope, "once");
});

// —————————————————————— G. 白名单 0 judge（项目角色 / 内置审批档） ——————————————————————

test("G/AC-12/AC-13/AC-14：例行白名单形态在项目角色与内置审批档 c-allow、judge 调用=0；npm install 仍走既有判断", async () => {
  const fx = makeTempProject();
  const positives: string[][] = [
    ["npm", "test"],
    ["npm", "run", "test"],
    ["npm", "run", "typecheck"],
    ["npm", "run", "lint"],
    ["npm", "run", "check"],
    ["node", "--test"],
    ["node", "--test", "test/x.test.ts"],
    ["tsc", "--noEmit"],
    ["npm", "ci"],
  ];
  try {
    for (const tier of ["project", "operator"] as const) {
      const operator = operatorDouble(judgeDenyOutcome());
      const audit = createMemoryAuditSink();
      const gate =
        tier === "project"
          ? await assembleProjectShellGate({
              project: fx.project,
              operatorChannel: operator.fn,
              classifyShell,
              rules: defaultShellRules(),
              writeGuard: realWriteGuard(fx.project),
              auditSink: audit,
              timeoutMs: 5000,
              env: {},
              sessionDeps: {
                createAdapter: () => {
                  throw new Error("白名单命令不得触达判断会话");
                },
              },
            })
          : await assembleOperatorShellGate({
              project: fx.project,
              operatorChannel: operator.fn,
              classifyShell,
              rules: defaultShellRules(),
              writeGuard: realWriteGuard(fx.project),
              auditSink: audit,
              timeoutMs: 5000,
              env: {},
            });
      for (const argv of positives) {
        const result = await gate(reqOf(argv, { cwd: fx.root }));
        assert.equal(result.allow, true, `${tier}：${argv.join(" ")} 应 c-allow`);
        assert.equal(operator.calls.length, 0, `${tier}：白名单不得调用判断通道：${argv.join(" ")}`);
      }
      const routineReviews = reviewRecords(audit).slice(-positives.length);
      assert.equal(routineReviews.length, positives.length);
      for (const record of routineReviews) {
        assert.equal(record.branch, BRANCH_C_ALLOW);
        assert.equal(record.judge, undefined);
        assert.equal(record.customerGrant, undefined);
        assert.deepEqual(record.conditions, ["shell-gate"]);
      }
      // 非白名单形态保留既有判断（npm install <新包> → risky/script → 判断通道）。
      const install = await gate(reqOf(["npm", "install", "lodash"], { cwd: fx.root }));
      assert.equal(install.allow, false, `${tier}：npm install 仍走既有判断（桩判拒）`);
      assert.equal(operator.calls.length, 1, `${tier}：npm install 必须调用判断通道`);
      assert.equal(reviewRecords(audit).at(-1)!.branch, "script:review→a-deny");
    }
  } finally {
    fx.cleanup();
  }
});

// —————————————————————— H. 审计四类可区分 ——————————————————————

test("H/AC-22/AC-33：judge 放行 / 客户手批 / 客户升级授权 / escalation-decision 四类字段可区分；deny 档放行保留 tier+hardDenyOverride", async () => {
  const root = path.join(os.tmpdir(), "ans-shell-escalation-audit-root");
  const audit = createMemoryAuditSink();
  const presenter = presenterDouble([{ action: "allow-once", operatorId: "cust-1" }]);
  const registry = createShellEscalationSession({
    roleId: ROLE,
    projectRoot: root,
    runtime: "pi",
    present: presenter.fn,
    now: () => NOW,
    presentTimeoutMs: 2000,
    idFactory: () => "req-1",
    env: {},
  });
  const operator = sequencedOperator([
    { outcome: "allow", operatorId: "judge:pi", judge: { engine: "pi", verdict: "allow", reasonCode: "ok", reason: "任务明确需要" } },
    judgeDenyOutcome(),
    { outcome: "allow", operatorId: "customer-manual" },
    {
      outcome: "allow",
      operatorId: "judge:pi",
      judge: { engine: "pi", verdict: "allow", reasonCode: "hard-deny-override", tier: "deny", hardDenyOverride: true, reason: "客户已确认" },
    },
  ]);
  const gate = buildShellGate({
    projectRoot: root,
    skillRoot: root,
    pmBoundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    auditSink: audit,
    classifyShell: () => ({ decision: "review", ruleId: "test:review" }),
    rules: EMPTY_RULES,
    operatorChannel: operator.fn,
    timeoutMs: 5000,
    env: {},
    onReviewed: (req, outcome) => registry.recordReview(req, outcome),
    takeGrant: (req, ctx) => registry.takeGrant(req, ctx),
    onAuditSinkCreated: (sink) => registry.bindAudit(sink),
  });

  const judgeAllowed = await gate(reqOf(["tool-judge-allow"], { cwd: root }));
  assert.equal(judgeAllowed.allow, true);
  const escalateArgv = ["tool-escalate"];
  assert.equal((await gate(reqOf(escalateArgv, { cwd: root }))).allow, false);
  assert.equal((await registry.request({ command: "tool-escalate", argv: escalateArgv })).ok, true);
  assert.equal((await gate(reqOf(escalateArgv, { cwd: root }))).allow, true);
  assert.equal((await gate(reqOf(["tool-manual"], { cwd: root }))).allow, true);
  assert.equal((await gate(reqOf(["tool-deny-tier"], { cwd: root }))).allow, true);

  const reviews = reviewRecords(audit);
  // ① judge 放行：含 judge、by 以 operator:judge:<engine> 结尾、无 customerGrant。
  //    本夹具未注入 pmAsk ⇒ (b) 不可用升级到 (a)，分支为 `b-unavailable→a-allow`（既有链形状）。
  const judgeAllow = reviews.find((record) => record.command === "tool-judge-allow")!;
  assert.equal(judgeAllow.judge?.verdict, "allow");
  assert.equal(judgeAllow.branch, "b-unavailable→a-allow");
  assert.match(judgeAllow.by, /→ operator:judge:pi$/);
  assert.equal(judgeAllow.customerGrant, undefined);
  // ② 客户手批（开关关闭时的既有确认路径形状）：无 judge、无 customerGrant、branch 以 →a-allow 结尾、by 以 operator: 结尾。
  const manual = reviews.find((record) => record.command === "tool-manual")!;
  assert.equal(manual.judge, undefined);
  assert.equal(manual.customerGrant, undefined);
  assert.ok(manual.branch.endsWith("→a-allow"));
  assert.match(manual.by, /→ operator:customer-manual$/);
  // ③ 客户升级授权放行：含 customerGrant（requestId/scope/operatorId）且无 judge，独立 branch、by 以 customer: 开头。
  const grantReview = reviews.find((record) => record.customerGrant !== undefined)!;
  assert.equal(grantReview.command, "tool-escalate");
  assert.deepEqual(grantReview.customerGrant, { requestId: "req-1", scope: "once", operatorId: "cust-1" });
  assert.equal(grantReview.judge, undefined);
  assert.equal(grantReview.branch, BRANCH_CUSTOMER_ESCALATION_ALLOW_ONCE);
  assert.match(grantReview.by, /^customer:cust-1（grant:req-1）$/);
  // ④ deny 档被 judge 放行：tier:"deny" + hardDenyOverride:true 保留。
  const denyTier = reviews.find((record) => record.command === "tool-deny-tier")!;
  assert.equal(denyTier.judge?.tier, "deny");
  assert.equal(denyTier.judge?.hardDenyOverride, true);
  // ⑤ 申请决定：event:"escalation-decision"，必填字段与稳定 branch/by。
  const decisions = escalationRecords(audit);
  assert.equal(decisions.length, 1);
  const decision = decisions[0]!;
  assert.equal(decision.event, "escalation-decision");
  assert.equal(decision.branch, BRANCH_ESCALATION_GRANTED_ONCE);
  assert.equal(decision.by, "operator:cust-1");
  assert.equal(decision.toolCallId, "");
  assert.equal(decision.execution, "未执行");
  assert.deepEqual(decision.conditions, ["shell-gate"]);
  assert.deepEqual(decision.escalation, { requestId: "req-1", action: "allow-once", roleId: ROLE });
  assert.equal(decision.judge, undefined);
  assert.equal(decision.customerGrant, undefined);
});

// —————————————————————— I. c=allow 不消费 / c=deny 不消费不放行 ——————————————————————

test("I/AC-07：c=allow 不消费一次性授权；c=deny 分类不消费、不放行（授权保留到下一次 review 匹配）", async () => {
  const root = path.join(os.tmpdir(), "ans-shell-escalation-order-root");
  const audit = createMemoryAuditSink();
  const presenter = presenterDouble([{ action: "allow-once", operatorId: "cust-9" }]);
  const registry = createShellEscalationSession({
    roleId: ROLE,
    projectRoot: root,
    runtime: "pi",
    present: presenter.fn,
    now: () => NOW,
    presentTimeoutMs: 2000,
    idFactory: () => "req-1",
    env: {},
  });
  const operator = operatorDouble(judgeDenyOutcome());
  let mode: ShellClass = "review";
  const gate = buildShellGate({
    projectRoot: root,
    skillRoot: root,
    pmBoundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    auditSink: audit,
    classifyShell: () => ({ decision: mode, ruleId: `test:${mode}` }),
    rules: EMPTY_RULES,
    operatorChannel: operator.fn,
    timeoutMs: 5000,
    env: {},
    onReviewed: (req, outcome) => registry.recordReview(req, outcome),
    takeGrant: (req, ctx) => registry.takeGrant(req, ctx),
    onAuditSinkCreated: (sink) => registry.bindAudit(sink),
  });
  const argv = ["mysterytool", "--order"];
  assert.equal((await gate(reqOf(argv, { cwd: root }))).allow, false);
  assert.equal((await registry.request({ command: "mysterytool --order", argv })).ok, true);

  mode = "allow";
  assert.equal((await gate(reqOf(argv, { cwd: root }))).allow, true);
  assert.equal(reviewRecords(audit).at(-1)!.branch, BRANCH_C_ALLOW);

  mode = "deny";
  assert.equal((await gate(reqOf(argv, { cwd: root }))).allow, false);
  assert.equal(reviewRecords(audit).at(-1)!.branch, "c-deny");
  assert.equal(operator.calls.length, 1, "c-deny 终结不调用判断通道");

  mode = "review";
  const granted = await gate(reqOf(argv, { cwd: root }));
  assert.equal(granted.allow, true, "一次性授权未被 c=allow/c=deny 消费");
  assert.equal(reviewRecords(audit).at(-1)!.branch, BRANCH_CUSTOMER_ESCALATION_ALLOW_ONCE);
  assert.equal(operator.calls.length, 1);

  const consumed = await gate(reqOf(argv, { cwd: root }));
  assert.equal(consumed.allow, false);
  assert.equal(operator.calls.length, 2, "授权消费后回正常链");
});

// —————————————————————— J. 暂停语义 ——————————————————————

test("J/AC-20：暂停状态机 shell-only、非法输入不改状态；治理 approval 组不被暂停影响（按 main.ts 现有代码事实）", () => {
  const pause = createShellSessionPauseState();
  assert.equal(pause.isPaused(), false, "初始未暂停");
  assert.deepEqual(pause.set({ paused: true }), { version: 1, ok: true, paused: true });
  assert.equal(pause.isPaused(), true);
  // 非法输入：不改状态、回执 ok:false（沿用 shell:judge-set 同级校验）。
  const invalid: unknown[] = [null, 42, "true", [], {}, { paused: "yes" }, { paused: true, extra: 1 }];
  for (const input of invalid) {
    const reply = pause.set(input);
    assert.equal(reply.ok, false, JSON.stringify(input));
    assert.equal(reply.paused, true, "非法输入不改变当前状态");
    assert.equal(pause.isPaused(), true);
  }
  assert.deepEqual(pause.set({ paused: false }), { version: 1, ok: true, paused: false });
  assert.equal(pause.isPaused(), false);
  pause.reset();
  assert.equal(pause.isPaused(), false);

  // 有效值组合（与 app/main.ts 代码事实一致）：shell 操作者通道 = 持久化开关 && !paused；
  // 治理 approval 组只看 shellJudgeSwitch（不受暂停影响）。
  const switchState = createShellJudgeSwitch(true);
  const shellOperatorEnabled = (): boolean => switchState.isEnabled() && !pause.isPaused();
  const governanceApprovalEnabled = (): boolean => (switchState.isEnabled() ? true : false);
  pause.set({ paused: true });
  assert.equal(shellOperatorEnabled(), false, "暂停后 shell 操作者通道降级为逐条客户确认");
  assert.equal(governanceApprovalEnabled(), true, "治理 approval 组不被暂停影响");
  assert.equal(switchState.isEnabled(), true, "暂停不改持久化开关值");
  pause.set({ paused: false });
  assert.equal(shellOperatorEnabled(), true, "恢复即回到持久化开关值");

  // 代码事实钉死（main.ts 的两处表达式）：暂停只作用于 shell 操作者通道，治理组仍只读全局开关。
  const mainSrc = fs.readFileSync(new URL("../../app/main.ts", import.meta.url), "utf8");
  assert.ok(
    mainSrc.includes("isEnabled: () => shellJudgeSwitch.isEnabled() && !shellSessionPaused.isPaused()"),
    "shell 操作者通道有效值必须叠加暂停",
  );
  assert.ok(
    mainSrc.includes('isGroupEnabled: (group) => (group === "approval" ? shellJudgeSwitch.isEnabled() : decisionJudgeSwitch.isEnabled())'),
    "治理 approval 组只读全局开关（不读暂停）",
  );
  assert.ok(mainSrc.includes("const shellSessionPaused = createShellSessionPauseState();"), "暂停状态为模块级单例（跨窗口重开保留、重启清零）");
});

// —————————————————————— K. presenter pending（E2 返工 R2） ——————————————————————

test("K/AC-09（E2 R2）：presenter 返回 pending ⇒ 不消耗申请权/会话额度、record 保持 recorded、无 escalation-decision 审计、不创建授权；解除后再次申请可 allow-once", async () => {
  const fx = makeTempProject();
  const audit = createMemoryAuditSink();
  const operator = operatorDouble(judgeDenyOutcome());
  // 第一次呈现返回 pending（模拟审批卡待答）；第二次（审批卡解除后）返回 allow-once。
  const presenter = presenterDouble([
    { action: "pending", reason: "审批卡待答" },
    { action: "allow-once", operatorId: "cust-p" },
  ]);
  // 会话上限压到 1：若 pending 消耗额度，第二次申请会被 capped（断言额度回滚）。
  const session = await openSession({
    project: fx.project,
    operator: operator.fn,
    presenter: presenter.fn,
    audit,
    escalationOptions: { maxRequestsPerSession: 1 },
  });
  try {
    const caps = session.caps;
    const argv = ["mysterytool", "--pending-path"];
    assert.equal((await caps.shellGate!(reqOf(argv, { cwd: fx.root }))).allow, false, "先有 judge 判拒记录");
    const pendingReceipt = await caps.shellEscalation!({ command: argv.join(" "), argv });
    assert.equal(pendingReceipt.ok, false);
    assert.equal(pendingReceipt.state, "pending", "pending 是独立状态，不是 denied/expired");
    assert.match(pendingReceipt.message, /pending shell 确认卡/);
    assert.match(pendingReceipt.message, /请稍后再申请/);
    assert.doesNotMatch(pendingReceipt.message, /未获客户允许/, "pending 不得写成默认拒绝");
    assert.equal(presenter.cards.length, 1);
    assert.equal(escalationRecords(audit).length, 0, "pending 无客户决定 ⇒ 不写 escalation-decision 审计");
    // 不创建授权：原样重试回正常链（判断通道第二次调用）并被拒。
    assert.equal((await caps.shellGate!(reqOf(argv, { cwd: fx.root }))).allow, false);
    assert.equal(operator.calls.length, 2);
    assert.equal(
      reviewRecords(audit).filter((record) => record.customerGrant !== undefined).length,
      0,
      "pending 不得创建授权",
    );
    // 第二次申请：每命令申请权与会话额度都未被 pending 消耗 ⇒ 重新呈现并 allow-once 成功。
    const secondReceipt = await caps.shellEscalation!({ command: argv.join(" "), argv });
    assert.equal(secondReceipt.ok, true, secondReceipt.message);
    assert.equal(secondReceipt.state, "granted-once");
    assert.equal(presenter.cards.length, 2, "pending 后再次申请重新呈现（record 保持 recorded）");
    assert.equal(escalationRecords(audit).length, 1, "真正的客户决定才写 escalation-decision 审计");
    const retry = await caps.shellGate!(reqOf(argv, { cwd: fx.root }));
    assert.equal(retry.allow, true, "allow-once 后原样重试由客户授权放行");
    assert.equal(operator.calls.length, 2);
  } finally {
    await session.dispose();
    fx.cleanup();
  }
});

// —————————————————————— L. AC-19 行视图新措辞（E2 R2 增量） ——————————————————————

test("L/AC-19（E2 R2）：判拒结果行 retryHint 同时含新措辞「可让角色申请客户确认」与兜底「关闭「替我审批」后重试」（旧子串语义保留）", () => {
  const view = shellJudgeResultView({
    verdict: "deny",
    engine: "pi",
    reason: "系统风险：会删除未提交源码",
    customerMessage: "自动代理未放行该命令。",
    alternative: { kind: "command", value: "npm run typecheck" },
    toolCallId: "ac19-1",
  });
  assert.ok(view !== null);
  assert.equal(view.verdict, "deny");
  // 新出路措辞（方案 §4.6/AC-19：可申请客户确认 + 三选项说明）。
  assert.ok(view.retryHint.includes("可让角色申请客户确认"));
  assert.ok(view.retryHint.includes("允许一次 / 本会话允许该命令 / 拒绝"));
  // 兜底措辞保留（「关闭」「替我审批」「重试」三词，既有 containsExitLine 兼容）。
  assert.ok(view.retryHint.includes("关闭「替我审批」后重试"));
  // 与 A3 冻结的共享 i18n key 同值（单一来源）。
  assert.equal(view.retryHint, translate(DEFAULT_LOCALE, "ui.judge.closeAndRetry"));
  // allow 行不显示出路（既有语义不变）。
  const allowView = shellJudgeResultView({ verdict: "allow", engine: "pi", reason: "任务明确" });
  assert.ok(allowView !== null);
  assert.equal(allowView.retryHint, "");
});
