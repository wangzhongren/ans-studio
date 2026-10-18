import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { buildShellJudgeTools } from "../../src/common/runtime-core/shell-judge/tools.ts";
import { mcpServersOverride } from "../../src/common/codex-adapter/config.ts";
import type { ShellJudgeReadStats, ToolDefinition, RuntimeSessionStorage } from "../../src/model/runtime.ts";
import { harness, options, role, collect, start, tick } from "./fixtures.ts";

// P3c（2026-10-17 PM 评审 §6.1/§7.1/§十一）：Codex 判断会话（「替我审」）。
// 验收点：工具集恰为 judge_read_file/judge_list_dir/report_shell_judgement（A12/A35）；写/命令/交互/
// 派发工具不存在；report 原样回调；web search 强制关闭；外来/已安装 MCP 不装配；不持久化；原生工具泄漏隔离。
// 全部离线（假引擎 + 内存 MCP），不读 .env、不跑真实模型/凭据/网络。

const stats = (): ShellJudgeReadStats => ({ readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false });
const judgeTools = (report: (raw: unknown) => void = () => {}, root = "/fixture") => buildShellJudgeTools({ projectRoot: root, report, stats: stats() });
const dynamicNames = (engine: { requests: Array<{ method: string; params: Record<string, unknown> }> }) => {
  const thread = engine.requests.find(request => request.method === "thread/start")!;
  return (thread.params.dynamicTools as Array<{ name: string }>).map(tool => tool.name).sort();
};
const storage = (): { stub: RuntimeSessionStorage; calls: () => number } => {
  let calls = 0;
  const directory = path.join(os.tmpdir(), "ans-codex-judge-storage");
  const stub: RuntimeSessionStorage = {
    runtime: "codex", roleId: role.id, directory, nativeDirectory: path.join(directory, "native"),
    async validateNativeDirectory() { calls++; },
    async prepareNativeDirectory() { calls++; },
    async readLatest() { calls++; return undefined; },
    async saveSession() { calls++; },
    async appendReplay() { calls++; },
    async readReplay() { calls++; return []; },
  };
  return { stub, calls: () => calls };
};

test("judge mode accepts exactly the three read-only tools and refuses any write/shell tool before any effect", () => {
  const engines = harness();
  const judge = judgeTools();
  const foreign: ToolDefinition[][] = [
    [...judge, { name: "write_file", description: "x", inputSchema: { type: "object" }, async handler() { return { ok: true, message: "" }; } }],
    [{ name: "run_shell", description: "x", inputSchema: { type: "object" }, async handler() { return { ok: true, message: "" }; } }],
    judge.slice(0, 2),
    [],
  ];
  for (const tools of foreign) {
    assert.throws(() => createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools })), /frozen judge tool set/);
  }
  assert.equal(engines.engines.length, 0, "拒绝发生在装配前：零引擎/零副作用");
});

test("judge session registers only the three judge tools; write/shell/interaction/dispatch calls do not exist", async () => {
  const engines = harness({ mcpServers: [] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools: judgeTools() })).bindRole(role);
  assert.deepEqual(dynamicNames(engines.engine), ["ans_judge_list_dir", "ans_judge_read_file", "ans_report_shell_judgement"], "原生工具面恰三项（A12）");
  const thread = engines.engine.requests.find(request => request.method === "thread/start")!;
  assert.match(String(thread.params.developerInstructions), /只读判断会话/);
  assert.equal(String(thread.params.developerInstructions).includes("修改、命令、交互和回交"), false, "判断会话提示面不宣称写/命令能力");
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
  assert.equal((await engines.engine.handler!("item/commandExecution/requestApproval", {})).decision, "decline");
  assert.equal((await engines.engine.handler!("item/fileChange/requestApproval", {})).decision, "decline");
  assert.deepEqual(await engines.engine.handler!("item/permissions/requestApproval", {}), { permissions: {}, scope: "turn" });
  assert.deepEqual(await engines.engine.handler!("item/tool/requestUserInput", {}), { answers: {} }, "无客户交互");
  const started = engines.engine.requests.find(request => request.method === "turn/start")!;
  assert.deepEqual(started.params.sandboxPolicy, { type: "readOnly", networkAccess: false }, "只读沙箱、网络关闭");
  engines.engine.finish(); await turn.completion; await session.dispose();
});

test("report_shell_judgement hands the model's raw arguments back unchanged", async () => {
  const reported: unknown[] = [];
  const engines = harness({ mcpServers: [] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools: judgeTools(raw => reported.push(raw)) })).bindRole(role);
  const turn = await start(session, engines.engine);
  const payload = {
    verdict: "deny",
    reason: "当前任务不需要改动依赖目录",
    customerMessage: "这一步没有必要；如需执行请关闭「替我审」后重试",
    evidence: ["src/provider/codex/session.ts", "角色卡/Codex适配器/memo.md"],
    alternative: { kind: "command", value: "npm ls --depth=0", rationale: "先确认依赖现状" },
  };
  const receipt = await engines.engine.call("report_shell_judgement", payload);
  assert.equal(receipt.success, true);
  assert.deepEqual(reported, [payload], "原样回调：不做取值域/长度/歧义规范化（规范化在编排）");
  engines.engine.finish(); await turn.completion; await session.dispose();
});

test("judge mode forces web search off and assembles no installed/foreign MCP even when requested", async () => {
  const engines = harness({ mcpServers: ["probe-mcp", "foreign"] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    judgeMode: true,
    tools: judgeTools(),
    webSearch: true,
    installedMcpServers: [{ name: "probe-mcp", command: process.execPath, args: ["server.mjs"] }],
    env: { CODEX_API_KEY: "fake-codex-key", ANS_CODEX_WEB_SEARCH: "on", PATH: process.env.PATH },
  })).bindRole(role);
  assert.equal(engines.engines.length, 2, "发现原生 server ⇒ 二次连接全量禁用");
  for (const engine of engines.engines) {
    assert.ok(engine.input.configOverrides.includes('web_search="disabled"'), "判断模式强制关闭 server-side web search（忽略 options/env）");
    assert.equal(engine.input.configOverrides.some(value => value.includes('"probe-mcp"={command=')), false, "已安装 MCP 声明不得装配");
  }
  const expected = mcpServersOverride(["probe-mcp", "foreign"], []);
  const maps = engines.engine.input.configOverrides.filter(value => value.startsWith("mcp_servers="));
  assert.deepEqual(maps, [expected], "白名单为空：所有原生 server 只在同一条 root map 内禁用");
  const thread = engines.engine.requests.find(request => request.method === "thread/start")!;
  assert.deepEqual((thread.params.config as { mcp_servers: unknown }).mcp_servers, { "probe-mcp": { enabled: false }, foreign: { enabled: false } });
  await session.dispose();
});

test("judge mode ignores injected storage: no session reads/writes and the native thread is ephemeral", async () => {
  const engines = harness({ mcpServers: [] });
  const sessionStorage = storage();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools: judgeTools(), storage: sessionStorage.stub })).bindRole(role);
  assert.equal(sessionStorage.calls(), 0, "不读/不写会话记录（persistSession:false）");
  assert.equal(session.contextSource, "in-memory");
  const thread = engines.engine.requests.find(request => request.method === "thread/start")!;
  assert.equal(thread.params.ephemeral, true, "原生线程 ephemeral：不落盘");
  assert.equal(String(engines.engine.input.env.CODEX_HOME).startsWith(sessionStorage.stub.nativeDirectory), false, "CODEX_HOME 走临时目录");
  await session.dispose();
  assert.equal(sessionStorage.calls(), 0);
});

test("judge mode quarantines native MCP/web-search leaks; the normal path still maps them", async () => {
  for (const leak of ["mcp", "search"] as const) {
    const engines = harness({ mcpServers: [] });
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { judgeMode: true, tools: judgeTools() })).bindRole(role);
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
  // 普通角色会话：同样的原生 MCP 行照旧映射、不隔离（逐字不变）。
  const engines = harness({ mcpServers: [] });
  const normal = await createCodexRuntimeAdapter(options("/fixture", engines, { tools: [{ name: "echo", description: "fixture", inputSchema: { type: "object" }, async handler() { return { ok: true, message: "echo" }; } }] })).bindRole(role);
  const events = collect(normal);
  const turn = await start(normal, engines.engine);
  engines.engine.mcpToolCall();
  await tick();
  engines.engine.finish(); await turn.completion; await normal.dispose(); await events.done;
  assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "completed");
  assert.ok(events.entries.some(event => (event.detail as { toolName?: string } | undefined)?.toolName === "mcp__fixture_mcp__echo"));
});

test("without judgeMode the adapter keeps its existing tool/web-search behavior", async () => {
  const engines = harness({ mcpServers: [] });
  let seen = false;
  const tool: ToolDefinition = { name: "echo", description: "fixture", inputSchema: { type: "object" }, async handler() { seen = true; return { ok: true, message: "ok" }; } };
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    tools: [tool],
    env: { CODEX_API_KEY: "fake-codex-key", ANS_CODEX_WEB_SEARCH: "on", PATH: process.env.PATH },
  })).bindRole(role);
  assert.ok(engines.engine.input.configOverrides.includes('web_search="live"'), "普通会话仍按 env 开启 web search");
  assert.deepEqual(dynamicNames(engines.engine), ["ans_echo"], "任意注入工具照旧注册（不做 judge 名单限制）");
  const context = await createCodexRuntimeAdapter(options("/fixture", harness(), { tools: [tool] })).composeContext(role);
  assert.match(context.systemPrompt, /修改、命令、交互和回交/);
  assert.equal(context.systemPrompt.includes("只读判断会话"), false);
  const turn = await start(session, engines.engine);
  assert.equal((await engines.engine.call("echo", {})).success, true);
  assert.equal(seen, true);
  engines.engine.finish(); await turn.completion; await session.dispose();
});
