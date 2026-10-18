import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  GOVERNANCE_CARD_GROUP,
  governanceCardGroup,
  type CustomerInputMetadata,
  type CustomerInputOutcome,
  type GovernanceJudgeAudit,
  type GovernanceJudgeContext,
  type GovernanceJudgeFacts,
  type GovernanceJudgeOutcome,
  type GovernanceJudgeRequest,
  type RoleSession,
  type RuntimeProviderFactory,
  type RuntimeProviderOptions,
  type SessionEvent,
  type ShellJudgeReadStats,
} from "../../src/model/runtime.ts";
import {
  ALL_JUDGE_TOOL_NAMES,
  GOVERNANCE_JUDGE_REPORT_TOOL,
  GOVERNANCE_JUDGE_TOOL_NAMES,
  buildGovernanceJudgeTools,
} from "../../src/common/runtime-core/governance-judge/tools.ts";
import { SHELL_JUDGE_TOOL_NAMES } from "../../src/common/runtime-core/shell-judge/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-governance-judge-"));

function freshStats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

function fixture(root: string, report: (raw: unknown) => void = () => {}) {
  const stats = freshStats();
  const tools = buildGovernanceJudgeTools({ projectRoot: root, report, stats });
  return { tools, byName: new Map(tools.map((tool) => [tool.name, tool])), stats };
}

const call = (name: string, args: Record<string, unknown>) => ({ name, args });

test("cardKind → group 单一映射：六个卡种全覆盖；未知/缺席永不判断", () => {
  assert.deepEqual(
    [...Object.keys(GOVERNANCE_CARD_GROUP)].sort(),
    ["acceptance", "appointment", "appointment-write", "proposal", "schedule-write", "write"],
  );
  assert.equal(governanceCardGroup("write"), "approval");
  assert.equal(governanceCardGroup("appointment-write"), "approval");
  assert.equal(governanceCardGroup("schedule-write"), "approval");
  assert.equal(governanceCardGroup("proposal"), "decision");
  assert.equal(governanceCardGroup("appointment"), "decision");
  assert.equal(governanceCardGroup("acceptance"), "decision");
  assert.equal(governanceCardGroup(undefined), undefined);
  assert.equal(governanceCardGroup("unknown-kind" as never), undefined, "运行时未知值也必须返回 undefined");
  assert.equal(Object.isFrozen(GOVERNANCE_CARD_GROUP), true, "映射冻结，禁止第二份/就地改写");
});

test("类型形状（评审 §6.1/§5.3 字段名逐字）：judge 请求/事实/上下文/审计/结果与可选扩展", () => {
  const facts: GovernanceJudgeFacts = {
    governanceModel: "trio",
    flowId: "flow-a",
    ledgerErrors: 0,
    proposalDecision: "accepted",
    appointmentTargetRoleIds: ["designer"],
    dispatchedStepIds: ["dispatch-1"],
    unresolvedClarificationCount: 0,
    latestDecisionKinds: ["proposal-accept"],
  };
  const context: GovernanceJudgeContext = {
    flowId: "flow-a",
    stepId: "step-1",
    toolCallId: "call-1",
    turnId: "turn-1",
    paths: ["docs/proposals/flow-a-v1.md"],
    pathProbes: [{ path: "docs/proposals/flow-a-v1.md", allowed: true }],
    allowedPathRoots: ["docs/proposals"],
    forbiddenPaths: [".ans/**"],
    artifacts: { proposalPath: "docs/proposals/flow-a-v1.md", flowPath: "docs/flows/flow-a.md" },
    recommendedRoleIds: ["designer"],
    facts,
  };
  const request: GovernanceJudgeRequest = {
    group: "decision",
    cardKind: "proposal",
    roleId: "rapporteur",
    projectRoot: "D:/project",
    runtime: "claude",
    governanceModel: "trio",
    flowId: "flow-a",
    stepId: "step-1",
    toolCallId: "call-1",
    turnId: "turn-1",
    turnText: "任务文本",
    card: { kind: "choice", title: "接受提案？", options: [{ id: "accept", label: "接受" }] },
    paths: ["docs/proposals/flow-a-v1.md"],
    pathProbes: [{ path: "docs/proposals/flow-a-v1.md", allowed: true }],
    allowedPathRoots: ["docs/proposals"],
    forbiddenPaths: [".ans/**"],
    artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    recommendedRoleIds: ["designer"],
    facts,
    at: "2026-10-18T00:00:00.000Z",
  };
  const audit: GovernanceJudgeAudit = {
    group: "approval",
    cardKind: "write",
    engine: "claude",
    model: "claude-sonnet-5",
    reasonCode: "sufficient",
    reason: "路径在写根内且预览充分",
    evidence: ["docs/proposals/flow-a-v1.md"],
    selected: ["accept"],
    confirmed: true,
    paths: ["docs/proposals/flow-a-v1.md"],
    pathDecisions: [{ path: "docs/proposals/flow-a-v1.md", ok: true }],
    durationMs: 1000,
    readCalls: 1,
    readBytes: 1024,
  };
  const outcome: GovernanceJudgeOutcome = {
    verdict: "approve",
    group: "approval",
    cardKind: "write",
    reasonCode: "sufficient",
    engine: "claude",
    value: { confirmed: true },
    paths: audit.paths,
    pathDecisions: audit.pathDecisions,
    evidence: audit.evidence,
  };
  const answered: CustomerInputOutcome = {
    outcome: "answered",
    value: { confirmed: true },
    operatorId: "judge:claude",
    judge: audit,
  };
  const metadata: CustomerInputMetadata = {
    turnId: "turn-1",
    roleId: "rapporteur",
    cardKind: "proposal",
    flowId: "flow-a",
    judgeContext: context,
  };
  const stats: ShellJudgeReadStats = { ...freshStats(), readPaths: ["docs/proposals/flow-a-v1.md"] };

  assert.equal(request.group, "decision");
  assert.equal(outcome.verdict, "approve");
  assert.equal(answered.outcome === "answered" ? answered.judge?.cardKind : undefined, "write");
  assert.equal(metadata.judgeContext?.facts.ledgerErrors, 0);
  assert.equal(stats.readPaths?.length, 1);
  assert.equal(GOVERNANCE_CARD_GROUP[request.cardKind], request.group, "group 与卡片种类必须来自同一份映射");
});

test("工具集恰为 judge_read_file / judge_list_dir / report_governance_judgement；并集只用于 allowlist", () => {
  const root = process.cwd();
  const { tools } = fixture(root);
  assert.deepEqual(tools.map((tool) => tool.name), ["judge_read_file", "judge_list_dir", "report_governance_judgement"]);
  assert.deepEqual([...GOVERNANCE_JUDGE_TOOL_NAMES], ["judge_read_file", "judge_list_dir", "report_governance_judgement"]);
  assert.deepEqual([...SHELL_JUDGE_TOOL_NAMES], ["judge_read_file", "judge_list_dir", "report_shell_judgement"]);
  assert.deepEqual(
    [...ALL_JUDGE_TOOL_NAMES],
    ["judge_read_file", "judge_list_dir", "report_shell_judgement", "report_governance_judgement"],
    "allowlist 并集恰四只、去重",
  );
  const names = new Set(tools.map((tool) => tool.name));
  assert.equal(names.has("report_shell_judgement"), false, "治理会话不得装配 shell report 工具");
  for (const forbidden of [
    "write_file", "edit_file", "read_file", "run_shell", "request_confirmation", "request_choice",
    "submit_report", "dispatch_task", "role_status", "session_tail", "propose_recovery",
    "install_skill", "uninstall_skill", "install_mcp", "uninstall_mcp",
  ]) {
    assert.equal(names.has(forbidden), false, `治理判断会话不得构造 ${forbidden}`);
  }
  // schema 与工具定义同源；report 只有 approve/manual 两值（不做负向代批）。
  assert.deepEqual(describeTool("judge_read_file").parameters.required, ["path"]);
  assert.deepEqual(describeTool("judge_list_dir").parameters.required, []);
  assert.deepEqual(describeTool(GOVERNANCE_JUDGE_REPORT_TOOL).parameters.required, ["verdict"]);
  const verdict = (describeTool(GOVERNANCE_JUDGE_REPORT_TOOL).parameters.properties as Record<string, { enum?: string[] }>).verdict;
  assert.deepEqual(verdict.enum, ["approve", "manual"]);
  for (const tool of tools) assert.equal(tool.inputSchema.type, "object");
});

test("读取策略：整棵 .ans/** 硬排除（账本/会话）；项目内物证可读并累积 readPaths", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, ".ans", "governance"), { recursive: true });
    await mkdir(path.join(root, ".ans", "sessions", "r"), { recursive: true });
    await mkdir(path.join(root, "docs", "proposals"), { recursive: true });
    await writeFile(path.join(root, ".ans", "governance", "ledger.jsonl"), `LEDGER_SECRET`, "utf8");
    await writeFile(path.join(root, ".ans", "sessions", "r", "x.jsonl"), `SESSION_SECRET`, "utf8");
    await writeFile(path.join(root, ".env"), `ENV_SECRET`, "utf8");
    await writeFile(path.join(root, "docs", "proposals", "flow-a-v1.md"), "# 提案\n\n范围与验收。\n", "utf8");

    const { byName, stats } = fixture(root);
    for (const target of [".ans/governance/ledger.jsonl", ".ans/sessions/r/x.jsonl", ".ans"]) {
      const result = target === ".ans"
        ? await byName.get("judge_list_dir")!.handler(call("judge_list_dir", { path: target }))
        : await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: target }));
      assert.equal(result.ok, false, `${target} 必须被拒绝`);
      assert.match(result.message, /应用私有数据/);
      for (const sentinel of ["LEDGER_SECRET", "SESSION_SECRET", root]) {
        assert.equal(result.message.includes(sentinel), false, `拒绝文案不得泄露 ${sentinel}`);
      }
    }

    const rootList = await byName.get("judge_list_dir")!.handler(call("judge_list_dir", {}));
    assert.equal(rootList.ok, true);
    assert.equal(rootList.message.includes(".ans"), false, "根列表不得列出 .ans");

    const env = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: ".env" }));
    assert.equal(env.ok, false);
    assert.match(env.message, /敏感/);

    const proposal = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: "docs/proposals/flow-a-v1.md" }));
    assert.equal(proposal.ok, true);
    assert.match(proposal.message, /范围与验收/);
    assert.deepEqual(stats.readPaths, ["docs/proposals/flow-a-v1.md"], "只需记录成功读取的项目相对路径");
    assert.equal(stats.deniedReads >= 4, true, "被拒读取仍计 deniedReads");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readPaths 去重且上限 16 条（required-read 门槛的事实来源）", async () => {
  const root = await temp();
  try {
    for (let index = 0; index < 17; index++) {
      await writeFile(path.join(root, `file-${index}.md`), `content-${index}`, "utf8");
    }
    const stats = freshStats();
    const tools = buildGovernanceJudgeTools({ projectRoot: root, report: () => {}, stats, budget: { maxCalls: 40, maxBytes: 200000 } });
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (let index = 0; index < 17; index++) {
      const result = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: `file-${index}.md` }));
      assert.equal(result.ok, true);
    }
    assert.equal(stats.readPaths?.length, 16, "readPaths 上限 16");
    assert.deepEqual(stats.readPaths?.slice(0, 2), ["file-0.md", "file-1.md"]);

    const dedupe = freshStats();
    const dedupeTools = buildGovernanceJudgeTools({ projectRoot: root, report: () => {}, stats: dedupe });
    const dedupeByName = new Map(dedupeTools.map((tool) => [tool.name, tool]));
    await dedupeByName.get("judge_read_file")!.handler(call("judge_read_file", { path: "file-0.md" }));
    await dedupeByName.get("judge_read_file")!.handler(call("judge_read_file", { path: "file-0.md" }));
    assert.deepEqual(dedupe.readPaths, ["file-0.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("report_governance_judgement 原样回调模型参数，不做裁决规范化", async () => {
  const root = await temp();
  try {
    const received: unknown[] = [];
    const { byName } = fixture(root, (raw) => { received.push(raw); });
    const raw = { verdict: "APPROVE?", reason: 42, selected: "not-an-array", pathDecisions: { path: "x" }, extra: { nested: true } };
    const result = await byName.get(GOVERNANCE_JUDGE_REPORT_TOOL)!.handler(call(GOVERNANCE_JUDGE_REPORT_TOOL, raw));
    assert.equal(result.ok, true);
    assert.equal(received.length, 1);
    assert.equal(received[0], raw, "回调必须收到同一份原始参数对象（不做克隆/归一）");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function adapterFactory(capture: (options: RuntimeProviderOptions) => void): RuntimeProviderFactory {
  return (options) => {
    registerControlledDisplayProfile(options);
    capture(options);
    return {
      async composeContext() { return { systemPrompt: "fixture" }; },
      async bindRole() {
        const queue = createEventQueue<SessionEvent>();
        const session: RoleSession = { async prompt() {}, events: () => queue.stream, async dispose() { queue.close(); } };
        return session;
      },
    };
  };
}

test("Service 装配：注入 governanceJudge 时只构造治理三工具、judgeMode=true、外来 MCP 置空", async () => {
  const root = await temp();
  let captured: RuntimeProviderOptions | undefined;
  try {
    const stats = freshStats();
    const session = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      governanceJudge: { projectRoot: root, report: () => {}, stats },
      // 即便误给写/shell/交互能力，judge 模式也不得把它们变成工具。
      shellGate: async () => ({ allow: false, reason: "fixture", by: "fixture" }),
      customerInput: () => ({ outcome: "declined" }),
      reportHandback: () => {},
      dispatchTask: () => {},
      providerFactories: { claude: adapterFactory((options) => { captured = options; }) },
    }).bindRole(role());
    await session.dispose();
    assert.ok(captured);
    assert.deepEqual(captured!.tools.map((tool) => tool.name), ["judge_read_file", "judge_list_dir", "report_governance_judgement"]);
    assert.equal(captured!.judgeMode, true);
    assert.deepEqual(captured!.installedMcpServers, []);
    assert.equal(captured!.tools.some((tool) => ["write_file", "edit_file", "read_file", "run_shell", "request_confirmation"].includes(tool.name)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Service 互斥：shellJudge 与 governanceJudge 同时给出 ⇒ 配置错误抛错（不静默择一）", async () => {
  const root = await temp();
  try {
    const stats = freshStats();
    assert.throws(
      () => createRuntimeAdapter({
        runtime: "claude",
        gate: allow,
        projectRoot: root,
        skillRoot: root,
        shellJudge: { projectRoot: root, report: () => {}, stats },
        governanceJudge: { projectRoot: root, report: () => {}, stats },
        providerFactories: { claude: adapterFactory(() => {}) },
      }),
      /互斥/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("未注入判断能力 ⇒ 不注册任何 judge 工具（逐字现状）", async () => {
  const root = await temp();
  let captured: RuntimeProviderOptions | undefined;
  try {
    const session = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      providerFactories: { claude: adapterFactory((options) => { captured = options; }) },
    }).bindRole(role());
    await session.dispose();
    assert.ok(captured);
    const names = new Set(captured!.tools.map((tool) => tool.name));
    assert.equal(names.has("judge_read_file"), false);
    assert.equal(names.has("judge_list_dir"), false);
    assert.equal(names.has("report_governance_judgement"), false);
    assert.equal(names.has("report_shell_judgement"), false);
    assert.equal(names.has("write_file"), true, "普通会话仍有受治理工具集");
    assert.equal(captured!.judgeMode, undefined, "未注入 ⇒ judgeMode 字段缺席");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
