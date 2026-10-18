import test from "node:test";
import assert from "node:assert/strict";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { buildShellJudgeTools } from "../../src/common/runtime-core/shell-judge/tools.ts";
import { buildGovernanceJudgeTools } from "../../src/common/runtime-core/governance-judge/tools.ts";
import type { ShellJudgeReadStats, ToolDefinition } from "../../src/model/runtime.ts";
import { harness, options, role, collect, start, realMcp } from "./fixtures.ts";

// P3c（2026-10-18 双开关评审 §6.2/§十一 P3c/AC19/AC24）：Codex 治理判断会话（「替我审批」/「替我决策」）。
// 验收点：judge allowlist 消费运行时核心并集 `ALL_JUDGE_TOOL_NAMES`（shell 工具面不变）；治理 judge 会话
// 恰注册 judge_read_file/judge_list_dir/report_governance_judgement；非白名单/混合集拒绝；report 原样回调；
// 普通模式不回归；MCP/网络不装配、原生泄漏仍隔离。
// 全部离线（假引擎 + 内存 MCP），不读 .env、不跑真实模型/凭据/网络。

const stats = (): ShellJudgeReadStats => ({ readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false });
const governanceTools = (report: (raw: unknown) => void = () => {}, root = "/fixture") => buildGovernanceJudgeTools({ projectRoot: root, report, stats: stats() });
const shellTools = (report: (raw: unknown) => void = () => {}, root = "/fixture") => buildShellJudgeTools({ projectRoot: root, report, stats: stats() });
const tool = (name: string): ToolDefinition => ({ name, description: "fixture", inputSchema: { type: "object" }, async handler() { return { ok: true, message: "" }; } });
const dynamicNames = (engine: { requests: Array<{ method: string; params: Record<string, unknown> }> }) => {
  const thread = engine.requests.find(request => request.method === "thread/start")!;
  return (thread.params.dynamicTools as Array<{ name: string }>).map(tool => tool.name).sort();
};
/** 环境缺 MCP SDK 时按既有方式跳过（Pi 适配器同款 `piInstalled` 先例）；说明在 skip 文案里。 */
async function sdkReady(): Promise<boolean> {
  try { await realMcp(); return true; } catch { return false; }
}
const SKIP_SDK = "未安装 @modelcontextprotocol/sdk@1.32.1：离线夹具不可用，按既有方式跳过";

test("judge allowlist accepts the governance trio and rejects non-allowlist/mixed sets before any effect", () => {
  const engines = harness();
  const governance = governanceTools();
  const shell = shellTools();
  // 并集 allowlist（ALL_JUDGE_TOOL_NAMES）：shell 与治理两类冻结集都接受——shell 工具面不变。
  assert.doesNotThrow(() => createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools: governance })));
  assert.doesNotThrow(() => createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools: shell })));
  const foreign: ToolDefinition[][] = [
    [...governance, tool("write_file")],                     // 夹带写工具
    [tool("run_shell")],                                     // 夹带 shell 工具
    [],                                                      // 空集
    governance.slice(0, 2),                                  // 缺 report
    [...governance, shell[2]!],                              // 两个 report 同时出现（4 只）
    [governance[0]!, shell[2]!, governance[2]!],             // 混合 report（缺 list）
    [governance[0]!, governance[0]!, governance[2]!],        // 重复名
  ];
  for (const tools of foreign) {
    assert.throws(() => createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools })), /frozen judge tool set/);
  }
  assert.equal(engines.engines.length, 0, "校验/拒绝发生在装配前：零引擎/零副作用");
});

test("governance judge session registers exactly the three governance tools; no write/shell/interaction/handback/dispatch surface", async (t) => {
  if (!(await sdkReady())) { t.skip(SKIP_SDK); return; }
  const engines = harness({ mcpServers: [] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools: governanceTools() })).bindRole(role);
  assert.deepEqual(dynamicNames(engines.engine), ["ans_judge_list_dir", "ans_judge_read_file", "ans_report_governance_judgement"], "治理判断工具面恰三项（AC19/AC24）");
  const thread = engines.engine.requests.find(request => request.method === "thread/start")!;
  assert.match(String(thread.params.developerInstructions), /只读判断会话/);
  assert.match(String(thread.params.developerInstructions), /report_governance_judgement/);
  assert.equal(String(thread.params.developerInstructions).includes("report_shell_judgement"), false, "治理会话提示面不宣称 shell report 工具");
  const turn = await start(session, engines.engine);
  for (const [name, args] of [
    ["write_file", { path: "x.txt", content: "x" }],
    ["edit_file", { path: "x.txt", old_string: "a", new_string: "b" }],
    ["run_shell", { command: "whoami" }],
    ["request_confirmation", { title: "x" }],
    ["request_choice", { title: "x" }],
    ["submit_report", {}],
    ["dispatch_task", { roleId: "other", task: "x" }],
  ] as const) {
    assert.equal((await engines.engine.call(name, args)).success, false, `${name} 不存在（工具未注册）`);
  }
  assert.equal((await engines.engine.call("report_shell_judgement", { verdict: "approve" })).success, false, "shell report 工具不注册");
  assert.equal((await engines.engine.handler!("item/commandExecution/requestApproval", {})).decision, "decline");
  assert.equal((await engines.engine.handler!("item/fileChange/requestApproval", {})).decision, "decline");
  assert.deepEqual(await engines.engine.handler!("item/permissions/requestApproval", {}), { permissions: {}, scope: "turn" });
  assert.deepEqual(await engines.engine.handler!("item/tool/requestUserInput", {}), { answers: {} }, "无客户交互");
  const started = engines.engine.requests.find(request => request.method === "turn/start")!;
  assert.deepEqual(started.params.sandboxPolicy, { type: "readOnly", networkAccess: false }, "只读沙箱、网络关闭");
  engines.engine.finish(); await turn.completion; await session.dispose();
});

test("report_governance_judgement hands the model's raw arguments back unchanged", async (t) => {
  if (!(await sdkReady())) { t.skip(SKIP_SDK); return; }
  const reported: unknown[] = [];
  const engines = harness({ mcpServers: [] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools: governanceTools(raw => reported.push(raw)) })).bindRole(role);
  const turn = await start(session, engines.engine);
  const payload = {
    verdict: "approve",
    cardKind: "proposal",
    selected: ["accept"],
    reason: "提案范围明确、与意图一致，验收口径可核对",
    evidence: ["docs/proposals/flow-a-v1.md", "docs/intents/intent-a.md"],
    pathDecisions: [{ path: "docs/proposals/flow-a-v1.md", ok: true }],
    confirmed: true,
  };
  const receipt = await engines.engine.call("report_governance_judgement", payload);
  assert.equal(receipt.success, true);
  assert.deepEqual(reported, [payload], "原样回调：不做取值域/长度/歧义规范化（规范化/required-read 在编排）");
  engines.engine.finish(); await turn.completion; await session.dispose();
});

test("governance judge forces web search off, assembles no installed MCP, and quarantines native leaks", async (t) => {
  if (!(await sdkReady())) { t.skip(SKIP_SDK); return; }
  for (const leak of ["mcp", "search"] as const) {
    const engines = harness({ mcpServers: ["probe-mcp", "foreign"] });
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
      judgeMode: true,
      tools: governanceTools(),
      webSearch: true,
      installedMcpServers: [{ name: "probe-mcp", command: process.execPath, args: ["server.mjs"] }],
      env: { CODEX_API_KEY: "fake-codex-key", ANS_CODEX_WEB_SEARCH: "on", PATH: process.env.PATH },
    })).bindRole(role);
    for (const engine of engines.engines) {
      assert.ok(engine.input.configOverrides.includes('web_search="disabled"'), "治理判断模式同样强制关闭 server-side web search");
      assert.equal(engine.input.configOverrides.some(value => value.includes('"probe-mcp"={command=')), false, "已安装 MCP 声明不得装配");
    }
    const events = collect(session);
    const turn = await start(session, engines.engine);
    if (leak === "mcp") engines.engine.mcpToolCall();
    else engines.engine.webSearch();
    await assert.rejects(turn.completion, /read-only judge session; session quarantined/);
    await session.dispose(); await events.done;
    const settled = events.entries.at(-1)!;
    assert.equal((settled.detail as { outcome: string }).outcome, "failed", `${leak} 泄漏 ⇒ 该轮隔离失败（fail closed）`);
    assert.equal(engines.engine.closed, true);
  }
});

test("shell judge mode still registers exactly the three shell tools after the union allowlist change", async (t) => {
  if (!(await sdkReady())) { t.skip(SKIP_SDK); return; }
  const engines = harness({ mcpServers: [] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools: shellTools() })).bindRole(role);
  assert.deepEqual(dynamicNames(engines.engine), ["ans_judge_list_dir", "ans_judge_read_file", "ans_report_shell_judgement"], "shell 工具面逐字不变");
  const thread = engines.engine.requests.find(request => request.method === "thread/start")!;
  assert.match(String(thread.params.developerInstructions), /report_shell_judgement/);
  assert.equal(String(thread.params.developerInstructions).includes("report_governance_judgement"), false, "shell 会话提示面不含治理 report 工具");
  await session.dispose();
});

test("without judgeMode the adapter keeps its existing tool/prompt behavior", async (t) => {
  if (!(await sdkReady())) { t.skip(SKIP_SDK); return; }
  const tools = governanceTools();
  const engines = harness({ mcpServers: [] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    tools,
    env: { CODEX_API_KEY: "fake-codex-key", ANS_CODEX_WEB_SEARCH: "on", PATH: process.env.PATH },
  })).bindRole(role);
  assert.ok(engines.engine.input.configOverrides.includes('web_search="live"'), "普通会话仍按 env 开启 web search");
  assert.deepEqual(dynamicNames(engines.engine), tools.map(tool => `ans_${tool.name}`).sort(), "普通会话不做 judge 名单限制（注入什么注册什么）");
  const context = await createCodexRuntimeAdapter(options("/fixture", harness(), { tools })).composeContext(role);
  assert.match(context.systemPrompt, /修改、命令、交互和回交/);
  assert.equal(context.systemPrompt.includes("只读判断会话"), false, "普通提示面逐字不变");
  const turn = await start(session, engines.engine);
  assert.equal((await engines.engine.call("report_governance_judgement", { verdict: "manual" })).success, true, "普通路径把 judge 工具当普通工具");
  engines.engine.finish(); await turn.completion; await session.dispose();
});
