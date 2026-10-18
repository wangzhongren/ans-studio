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

test("读取策略：.ans 只读开放 project.json 与 governance/ledger.jsonl；sessions 与其他 .ans 仍拒绝", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, ".ans", "governance"), { recursive: true });
    await mkdir(path.join(root, ".ans", "sessions", "r"), { recursive: true });
    await mkdir(path.join(root, "docs", "proposals"), { recursive: true });
    await writeFile(path.join(root, ".ans", "project.json"), `{"project":"demo"}`, "utf8");
    await writeFile(path.join(root, ".ans", "governance", "ledger.jsonl"), `LEDGER_LINE`, "utf8");
    await writeFile(path.join(root, ".ans", "governance", "extra.json"), `EXTRA_PRIVATE`, "utf8");
    await writeFile(path.join(root, ".ans", "sessions", "r", "x.jsonl"), `SESSION_SECRET`, "utf8");
    await writeFile(path.join(root, ".ans", "state.json"), `STATE_PRIVATE`, "utf8");
    await writeFile(path.join(root, ".env"), `ENV_SECRET`, "utf8");
    await writeFile(path.join(root, "docs", "proposals", "flow-a-v1.md"), "# 提案\n\n范围与验收。\n", "utf8");

    const stats = freshStats();
    const byName = new Map(buildGovernanceJudgeTools({ projectRoot: root, report: () => {}, stats, budget: { maxCalls: 20 } }).map((tool) => [tool.name, tool]));
    const projectJson = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: ".ans/project.json" }));
    assert.equal(projectJson.ok, true);
    assert.match(projectJson.message, /"project":"demo"/);
    const ledger = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: ".ans/governance/ledger.jsonl" }));
    assert.equal(ledger.ok, true);
    assert.match(ledger.message, /LEDGER_LINE/);

    // `.ans/governance/` 可列，但只显示 ledger.jsonl（其他内容不列名）。
    const governanceList = await byName.get("judge_list_dir")!.handler(call("judge_list_dir", { path: ".ans/governance" }));
    assert.equal(governanceList.ok, true);
    assert.match(governanceList.message, /ledger\.jsonl/);
    assert.equal(governanceList.message.includes("extra.json"), false, "只读开放目录只显示 ledger.jsonl");
    assert.equal(governanceList.message.includes("EXTRA_PRIVATE"), false);

    // sessions 与其他 .ans 内容仍 app-private 拒绝；`.ans` 本身仍不可列。
    for (const target of [".ans/sessions/r/x.jsonl", ".ans/state.json", ".ans/governance/extra.json"]) {
      const result = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: target }));
      assert.equal(result.ok, false, `${target} 必须被拒绝`);
      assert.match(result.message, /应用私有数据/);
      for (const sentinel of ["SESSION_SECRET", "STATE_PRIVATE", "EXTRA_PRIVATE", root]) {
        assert.equal(result.message.includes(sentinel), false, `拒绝文案不得泄露 ${sentinel}`);
      }
    }
    const ansList = await byName.get("judge_list_dir")!.handler(call("judge_list_dir", { path: ".ans" }));
    assert.equal(ansList.ok, false, ".ans 根目录仍不可列");
    const sessionsList = await byName.get("judge_list_dir")!.handler(call("judge_list_dir", { path: ".ans/sessions" }));
    assert.equal(sessionsList.ok, false, ".ans/sessions 不可列");

    const rootList = await byName.get("judge_list_dir")!.handler(call("judge_list_dir", {}));
    assert.equal(rootList.ok, true);
    assert.equal(rootList.message.includes(".ans"), false, "根列表不得列出 .ans");

    const env = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: ".env" }));
    assert.equal(env.ok, false);
    assert.match(env.message, /敏感/);

    const proposal = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: "docs/proposals/flow-a-v1.md" }));
    assert.equal(proposal.ok, true);
    assert.match(proposal.message, /范围与验收/);
    assert.deepEqual(stats.readPaths, [".ans/project.json", ".ans/governance/ledger.jsonl", "docs/proposals/flow-a-v1.md"], "成功读取按序累积");
    assert.equal(stats.deniedReads, 1, "只有 .env 这类敏感拒绝计入 deniedReads");
    assert.equal(stats.appPrivateDeniedReads, 5, "sessions/其他 .ans 读×3 + `.ans` 列×1 + `.ans/sessions` 列×1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("app-private 拒绝不计入 deniedReads（allow 不因读会话/私有文件被降级）；敏感/越界仍计入", async () => {
  const root = await temp();
  const outside = await temp();
  try {
    await mkdir(path.join(root, ".ans", "sessions", "r"), { recursive: true });
    await writeFile(path.join(root, ".ans", "sessions", "r", "x.jsonl"), "SESSION_CONTENT", "utf8");
    await writeFile(path.join(root, ".env"), "ENV_CONTENT", "utf8");
    await writeFile(path.join(outside, "secret.txt"), "OUTSIDE_CONTENT", "utf8");

    const { byName, stats } = fixture(root);
    const session = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: ".ans/sessions/r/x.jsonl" }));
    assert.equal(session.ok, false, ".ans/sessions 内容仍不可读");
    assert.match(session.message, /应用私有数据/);
    // 驱动的 damageCode 只看 deniedReads/truncatedReads/budgetExceeded：三者均未被 app-private 污染 ⇒ allow 不降级。
    assert.equal(stats.deniedReads, 0, "app-private 不计入 deniedReads（damageCode 输入保持干净）");
    assert.equal(stats.appPrivateDeniedReads, 1);
    assert.equal(stats.truncatedReads, 0);
    assert.equal(stats.budgetExceeded, false);
    assert.deepEqual(stats.deniedPaths, [{ path: ".ans/sessions/r/x.jsonl", code: "app-private", pathClass: "app-private" }]);

    const env = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: ".env" }));
    assert.equal(env.ok, false);
    assert.match(env.message, /敏感/);
    assert.equal(stats.deniedReads, 1, "普通敏感拒绝仍计入 deniedReads（allow 仍会降级）");

    const escape = await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: "../secret.txt" }));
    assert.equal(escape.ok, false);
    assert.equal(stats.deniedReads, 2, "越界拒绝仍计入 deniedReads");

    // 用同一 stats 的 list 拒绝也不计入 deniedReads。
    const list = await byName.get("judge_list_dir")!.handler(call("judge_list_dir", { path: ".ans/sessions" }));
    assert.equal(list.ok, false);
    assert.equal(stats.deniedReads, 2, "app-private 列表拒绝同样不计入 deniedReads");
    assert.equal(stats.appPrivateDeniedReads, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("deniedPaths：记录项目相对路径与类别（去重≤16）；敏感/根外不泄露绝对路径；app-private 记录相对路径", async () => {
  const root = await temp();
  const outside = await temp();
  try {
    await mkdir(path.join(root, ".ans", "sessions"), { recursive: true });
    await writeFile(path.join(root, ".ans", "sessions", "x.jsonl"), "SESSION", "utf8");
    await writeFile(path.join(root, ".env"), "ENV", "utf8");
    await writeFile(path.join(outside, "secret.txt"), "OUTSIDE", "utf8");

    const { byName, stats } = fixture(root);
    await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: ".env" }));
    await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: ".env" })); // 重复拒绝去重
    await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: ".ans/sessions/x.jsonl" }));
    await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: "../secret.txt" }));
    await byName.get("judge_read_file")!.handler(call("judge_read_file", { path: path.join(outside, "secret.txt") }));

    const sensitiveEntries = stats.deniedPaths?.filter((entry) => entry.code === "sensitive") ?? [];
    assert.deepEqual(sensitiveEntries, [{ path: ".env", code: "sensitive", pathClass: "env" }], "敏感路径去重且记相对路径");
    const privateEntries = stats.deniedPaths?.filter((entry) => entry.code === "app-private") ?? [];
    assert.deepEqual(privateEntries, [{ path: ".ans/sessions/x.jsonl", code: "app-private", pathClass: "app-private" }], "app-private 记录相对路径");
    const outsideEntries = stats.deniedPaths?.filter((entry) => entry.code === "outside-root") ?? [];
    assert.equal(outsideEntries.length >= 1, true);
    for (const entry of outsideEntries) {
      assert.equal(entry.path, "", "根外只记类别，不记绝对/相对外部路径");
      assert.equal(entry.pathClass, "outside-root");
    }
    assert.equal(JSON.stringify(stats.deniedPaths).includes(outside), false, "诊断不得包含项目外绝对路径");
    assert.equal(JSON.stringify(stats.deniedPaths).includes("OUTSIDE"), false);

    // 上限 16：17 个不同的敏感文件只留前 16 条（用独立预算会话）。
    for (let index = 0; index < 17; index++) {
      await writeFile(path.join(root, `secret-${index}.txt`), "x", "utf8");
    }
    const capped = freshStats();
    const cappedTools = buildGovernanceJudgeTools({ projectRoot: root, report: () => {}, stats: capped, budget: { maxCalls: 40 } });
    const cappedByName = new Map(cappedTools.map((tool) => [tool.name, tool]));
    for (let index = 0; index < 17; index++) {
      const result = await cappedByName.get("judge_read_file")!.handler(call("judge_read_file", { path: `secret-${index}.txt` }));
      assert.equal(result.ok, false);
    }
    assert.equal(capped.deniedPaths?.length, 16, "deniedPaths 上限 16 条");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("信息性读取结果（not-found/not-a-file/not-a-directory）不增加 deniedReads，仍记 deniedPaths；真实敏感/越界仍计数", async () => {
  const root = await temp();
  const outside = await temp();
  try {
    await mkdir(path.join(root, "dir"), { recursive: true });
    await writeFile(path.join(root, "file.txt"), "x", "utf8");
    await writeFile(path.join(root, ".env"), "ENV", "utf8");
    await writeFile(path.join(outside, "secret.txt"), "OUTSIDE", "utf8");

    const stats = freshStats();
    const byName = new Map(buildGovernanceJudgeTools({ projectRoot: root, report: () => {}, stats, budget: { maxCalls: 20 } }).map((tool) => [tool.name, tool]));
    const read = (target: string) => byName.get("judge_read_file")!.handler(call("judge_read_file", { path: target }));
    const list = (target: string) => byName.get("judge_list_dir")!.handler(call("judge_list_dir", { path: target }));

    const missing = await read("missing.md");
    assert.equal(missing.ok, false);
    assert.match(missing.message, /不存在/);
    const missingDir = await list("missing-dir");
    assert.equal(missingDir.ok, false);
    const dirAsFile = await read("dir");
    assert.equal(dirAsFile.ok, false);
    assert.match(dirAsFile.message, /不是常规文件/);
    const fileAsDir = await list("file.txt");
    assert.equal(fileAsDir.ok, false);
    assert.match(fileAsDir.message, /不是目录/);

    // 信息性结果不进入 damageCode 输入（deniedReads/truncatedReads/budgetExceeded 全部保持干净）⇒ allow 不被降级。
    assert.equal(stats.deniedReads, 0, "not-found/not-a-file/not-a-directory 不计入 deniedReads");
    assert.equal(stats.truncatedReads, 0);
    assert.equal(stats.budgetExceeded, false);
    assert.equal(stats.appPrivateDeniedReads, undefined);
    const informational = stats.deniedPaths?.filter((entry) => ["not-found", "not-a-file", "not-a-directory"].includes(entry.code)) ?? [];
    assert.equal(informational.some((entry) => entry.path === "missing.md" && entry.code === "not-found" && entry.pathClass === "unknown"), true);
    assert.equal(informational.some((entry) => entry.path === "missing-dir" && entry.code === "not-found"), true);
    assert.equal(informational.some((entry) => entry.path === "dir" && entry.code === "not-a-file"), true);
    assert.equal(informational.some((entry) => entry.path === "file.txt" && entry.code === "not-a-directory"), true);

    // 真实敏感/越界仍保持原计数语义（仍触发 allow 降级）。
    const env = await read(".env");
    assert.equal(env.ok, false);
    assert.equal(stats.deniedReads, 1);
    const escape = await read("../secret.txt");
    assert.equal(escape.ok, false);
    assert.equal(stats.deniedReads, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
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
