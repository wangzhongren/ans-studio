// test/测试/shell-judge-verify/g-engine-matrix.test.ts
// 测试角色：三引擎（Claude/Pi/Codex）判断工具面独立验证（2026-10-17）。
//
// 覆盖（PM 评审 §12.2-15 与 §12.1 A12/A25/A34/A35）：
//   · 运行时核心只读工具集恰三项，无写/编辑/shell/客户交互/回交/派发/MCP/网络工具；
//   · Service 装配对三引擎均注入同一份判据：`judgeMode:true`、`installedMcpServers:[]`、
//     工具恰三项、写门禁 deny-all（结构性不构造 governed tools）；
//   · Claude 真实适配器（假 SDK 注入）：原生工具面清空、allowedTools 恰三项、WebSearch 显式禁用、
//     判断系统提示只读；误注入写工具在 SDK 加载前抛错（零副作用）；
//   · Pi 假适配器判断模式：写/编辑/shell/交互/回交/派发工具不存在，judge 工具与 report 正常；
//   · Codex 真实适配器（假引擎 + 内存 MCP 桩）：仅注册三只 ans_ 判断工具、只读沙箱、网络关闭。
//
// 全部离线：不读取安装的 Pi/Codex 包、不跑真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import * as z from "zod";
import type { Options, Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import { createRuntimeAdapter } from "../../../src/service/runtime/session.ts";
import { createClaudeRuntimeAdapter, type ClaudeAdapterDependencies } from "../../../src/provider/claude/session.ts";
import { createCodexRuntimeAdapter, type CodexEngineInput, type CodexMcpModules, type CodexRpcConnection, type CodexRuntimeAdapterOptions } from "../../../src/provider/codex/session.ts";
import { createFakeRuntimeAdapter } from "../../../src/provider/pi/session.ts";
import { createRealPiRuntimeAdapter } from "../../../src/common/pi-adapter/real-adapter.ts";
import { resolvePiProviderConfig } from "../../../src/common/pi-adapter/provider-config.ts";
import {
  SHELL_JUDGE_LIST_TOOL,
  SHELL_JUDGE_READ_TOOL,
  SHELL_JUDGE_REPORT_TOOL,
  SHELL_JUDGE_TOOL_NAMES,
  buildShellJudgeTools,
} from "../../../src/common/runtime-core/shell-judge/tools.ts";
import { DISABLED_NATIVE_FEATURES } from "../../../src/common/codex-adapter/config.ts";
import { createInteractionGate } from "../../../src/common/runtime-core/timeout.ts";
import { createEventQueue } from "../../../src/common/runtime-core/event-queue.ts";
import type { RoleSession, RuntimeKind, RuntimeProviderOptions, SessionEvent } from "../../../src/model/runtime.ts";
import { judgeRole, judgeToolOptions, makeJudge, makeTempProject, REQUEST } from "./fixture.ts";

const EXPECTED = [SHELL_JUDGE_READ_TOOL, SHELL_JUDGE_LIST_TOOL, SHELL_JUDGE_REPORT_TOOL];

function until(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error("fixture wait timed out"));
      setTimeout(tick, 2);
    };
    tick();
  });
}

async function collect(session: RoleSession): Promise<{ events: SessionEvent[]; done: Promise<void> }> {
  const events: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) events.push(event); })();
  return { events, done };
}

test("运行时核心只读工具集：恰三项，无写/编辑/shell/交互/回交/派发/网络", async () => {
  const project = await makeTempProject();
  try {
    const tools = buildShellJudgeTools(judgeToolOptions(project.root));
    assert.deepEqual(tools.map((tool) => tool.name), EXPECTED);
    assert.deepEqual([...SHELL_JUDGE_TOOL_NAMES], EXPECTED);
    for (const forbidden of [
      "write_file", "edit_file", "read_file", "run_shell", "request_confirmation", "request_choice",
      "submit_report", "dispatch_task", "role_status", "session_tail", "propose_recovery",
      "install_skill", "uninstall_skill", "install_mcp", "uninstall_mcp",
      "web_search", "web_fetch", "fetch", "search",
    ]) {
      assert.equal(tools.some((tool) => tool.name === forbidden), false, `判断会话不得构造 ${forbidden}`);
    }
    for (const tool of tools) assert.equal(tool.inputSchema.type, "object");
    assert.deepEqual((tools.find((tool) => tool.name === SHELL_JUDGE_READ_TOOL)!.inputSchema.required), ["path"]);
    assert.deepEqual((tools.find((tool) => tool.name === SHELL_JUDGE_LIST_TOOL)!.inputSchema.required), []);
    assert.deepEqual((tools.find((tool) => tool.name === SHELL_JUDGE_REPORT_TOOL)!.inputSchema.required), ["verdict"]);
  } finally {
    await project.cleanup();
  }
});

test("判断驱动：适配器收到 deny-all 写门禁（判断会话结构性无写权限）", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: { report: { verdict: "allow", reason: "任务需要" } },
    });
    const outcome = await judge({
      ...REQUEST("deny-all-gate"),
      roleId: "verify-role",
      projectRoot: project.root,
      runtime: "claude",
      policy: "project",
      tier: "risky",
    });
    assert.equal(outcome.verdict, "allow");
    assert.ok(fake.seen.gate !== undefined, "适配器必须收到写门禁");
    const decision = fake.seen.gate!("/project/evil.ts");
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /判断 agent 只读/);
  } finally {
    await project.cleanup();
  }
});

test("Service 装配：三引擎都只拿到三只 judge 工具、judgeMode:true、MCP 置空、不持久化", async () => {
  const project = await makeTempProject();
  try {
    for (const runtime of ["claude", "pi", "codex"] as const) {
      const captured: { options?: RuntimeProviderOptions } = {};
      const adapter = createRuntimeAdapter({
        runtime: runtime as RuntimeKind,
        gate: () => ({ allowed: true, matchedEntry: { root: "project", path: "src/app.ts", kind: "file", purpose: "fixture" } }),
        projectRoot: project.root,
        skillRoot: project.root,
        shellJudge: judgeToolOptions(project.root),
        providerFactories: {
          [runtime]: (options: RuntimeProviderOptions) => {
            captured.options = options;
            options.registerToolDisplayProfile?.({ credentials: [] });
            const queue = createEventQueue<SessionEvent>();
            return {
              async composeContext() { return { systemPrompt: "" }; },
              async bindRole() {
                return {
                  async prompt() { queue.push({ kind: "settled", summary: "settled" }); },
                  events: () => queue.stream,
                  async dispose() { queue.close(); },
                };
              },
            };
          },
        },
      });
      // 捕获工厂收到的 provider options：Service 在 judge 能力注入时只构造三只 judge 工具。
      const session = await adapter.bindRole(judgeRole());
      assert.ok(captured.options !== undefined, `${runtime} 应捕获 provider options`);
      const options = captured.options!;
      assert.deepEqual(options.tools.map((tool) => tool.name), EXPECTED, `${runtime} 工具面必须恰三项`);
      assert.equal(options.judgeMode, true, `${runtime} 必须置 judgeMode`);
      assert.deepEqual(options.installedMcpServers, [], `${runtime} 外来 MCP 必须置空`);
      assert.equal(options.storage, undefined, `${runtime} 判断会话不得持久化`);
      for (const forbidden of ["write_file", "edit_file", "run_shell", "request_confirmation", "submit_report", "dispatch_task"]) {
        assert.equal(options.tools.some((tool) => tool.name === forbidden), false);
      }
      await session.dispose();
    }
  } finally {
    await project.cleanup();
  }
});

test("Pi 假适配器判断模式：写/编辑/shell/交互/回交/派发不存在；judge 读取与 report 正常", async () => {
  const project = await makeTempProject();
  try {
    const reported: unknown[] = [];
    const session = await createFakeRuntimeAdapter({
      gate: () => ({ allowed: true, matchedEntry: { root: "project", path: "x", kind: "file", purpose: "fixture" } }),
      projectRoot: project.root,
      shellJudge: { projectRoot: project.root, report: (raw) => reported.push(raw), stats: { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false } },
      script: [
        { name: "write_file", args: { path: "evil.txt", content: "x" } },
        { name: "edit_file", args: { path: "README.md", old_string: "a", new_string: "b" } },
        { name: "run_shell", args: { command: "whoami" } },
        { name: "request_confirmation", args: { title: "x" } },
        { name: "submit_report", args: {} },
        { name: "dispatch_task", args: { roleId: "other", task: "x" } },
        { name: SHELL_JUDGE_READ_TOOL, args: { path: "README.md" } },
        { name: SHELL_JUDGE_REPORT_TOOL, args: { verdict: "allow", reason: "任务需要" } },
      ],
    }).bindRole(judgeRole());
    const { events, done } = await collect(session);
    await session.prompt("判断");
    await session.dispose();
    await done;
    const denied = events.filter((event) => event.kind === "denied").map((event) => event.summary);
    for (const name of ["write_file", "edit_file", "run_shell", "request_confirmation", "submit_report", "dispatch_task"]) {
      assert.ok(denied.some((summary) => summary.includes(`未知工具，拒绝执行：${name}`)), `${name} 必须不存在`);
    }
    const accepted = events.filter((event) => event.kind === "accepted").map((event) => event.summary);
    assert.ok(accepted.some((summary) => summary.includes("judge_read_file: README.md")));
    assert.ok(accepted.some((summary) => summary.includes("report_shell_judgement")));
    assert.deepEqual(reported, [{ verdict: "allow", reason: "任务需要" }], "report 原样回调");
    // 判断模式未注册写工具 ⇒ 越界文件不会被创建。
    await assert.rejects(import("node:fs/promises").then((fs) => fs.stat(path.join(project.root, "evil.txt"))));
  } finally {
    await project.cleanup();
  }
});

// —————————————————————— Pi（真实适配器 + pi-ai faux provider，进程内离线） ——————————————————————

async function piFauxEngine() {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
  const runtime = await pi.ModelRuntime.create({
    credentials: new ai.InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id)!;
  const state: { constructed?: Parameters<typeof pi.createAgentSession>[0]; native?: Awaited<ReturnType<typeof pi.createAgentSession>>["session"]; mcpCalls: number } = { mcpCalls: 0 };
  const dependencies = {
    buildRuntime: async () => ({ runtime, model }),
    loadPi: async () => ({
      ...pi,
      createMcpExtension: (...args: Parameters<typeof pi.createMcpExtension>) => {
        state.mcpCalls += 1;
        return pi.createMcpExtension(...args);
      },
      async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) {
        state.constructed = input;
        const result = await pi.createAgentSession(input);
        state.native = result.session;
        return result;
      },
    }),
  };
  return { pi, ai, faux, dependencies, state };
}

test("Pi 真实适配器 judgeMode：只注册三只 judge 工具、原生/服务端/MCP 关闭、不持久化", async () => {
  const sdk = await piFauxEngine();
  const project = await makeTempProject();
  try {
    await writeFile(path.join(project.root, "note.txt"), "项目说明\n", "utf8");
    const reported: unknown[] = [];
    const config = resolvePiProviderConfig({
      providerId: "pi-judge-verify",
      baseUrl: "https://judge.invalid/",
      modelId: "judge-model",
      apiKeyEnvVar: "PI_JUDGE_FAKE_CREDENTIAL",
      contextWindow: 32768,
    }, { PI_JUDGE_FAKE_CREDENTIAL: "offline-placeholder" });
    sdk.faux.setResponses([
      sdk.ai.fauxAssistantMessage([
        sdk.ai.fauxToolCall(SHELL_JUDGE_READ_TOOL, { path: "note.txt" }),
        sdk.ai.fauxToolCall(SHELL_JUDGE_REPORT_TOOL, { verdict: "allow", reason: "只读且必要" }),
      ]),
      sdk.ai.fauxAssistantMessage("done"),
    ]);
    const session = await createRealPiRuntimeAdapter({
      runtime: "pi",
      projectRoot: project.root,
      skillRoot: project.root,
      tools: buildShellJudgeTools({ projectRoot: project.root, report: (raw) => reported.push(raw), stats: { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false } }),
      judgeMode: true,
      interactionGate: createInteractionGate(),
      currentTurnId: () => "judge-turn",
      installedMcpServers: [{ name: "decoy", command: "definitely-not-a-real-binary", args: [] }],
      config,
      logger: { stage() {}, trace() {}, traceEnabled: false },
      sessionDir: path.join(project.root, ".ans", "sessions", "judge"),
    }, sdk.dependencies).bindRole(judgeRole());

    assert.deepEqual([...sdk.state.native!.getActiveToolNames()].sort(), [...EXPECTED].sort(), "真实 Pi agent 工具面恰三项");
    assert.equal(sdk.state.constructed!.noTools, "builtin", "原生工具关闭");
    assert.equal(sdk.state.mcpCalls, 0, "judge 模式不得装配外来 MCP");
    await session.prompt("判断这条命令");
    await session.dispose();
    const events: SessionEvent[] = [];
    for await (const event of session.events()) events.push(event);
    assert.deepEqual(reported, [{ verdict: "allow", reason: "只读且必要" }], "report 原样回调");
    assert.equal(events.some((event) => /服务端工具/.test(event.summary)), false);
    assert.equal(session.contextSource, "in-memory", "判断会话不持久化");
    await assert.rejects(import("node:fs/promises").then((fs) => fs.stat(path.join(project.root, ".ans"))));
  } finally {
    await project.cleanup();
  }
});

// —————————————————————— Claude（假 SDK） ——————————————————————

interface ClaudeCapture {
  configurations: Options[];
  dependencies: ClaudeAdapterDependencies;
  loaded: () => number;
}

function claudeCapture(interrupt?: () => Promise<void>): ClaudeCapture {
  const configurations: Options[] = [];
  let loadCount = 0;
  const query = ({ prompt, options }: { prompt: AsyncIterable<SDKUserMessage> | string; options?: Options }): Query => {
    configurations.push(options!);
    const generator = (async function* () {
      if (typeof prompt !== "string") for await (const _user of prompt) { /* consume */ }
    })();
    return Object.assign(generator, {
      async interrupt() { await interrupt?.(); },
      close() { /* no-op */ },
      async mcpServerStatus() { return []; },
    }) as unknown as Query;
  };
  const dependencies: ClaudeAdapterDependencies = {
    env: { ANTHROPIC_API_KEY: "fixture-key", PATH: process.env.PATH },
    loadSdk: async () => {
      loadCount += 1;
      return {
        createSdkMcpServer: (() => ({ instance: { registerTool() {} }, timeout: 0 })) as never,
        query: query as never,
      };
    },
    loadZod: async () => z,
  };
  return { configurations, dependencies, loaded: () => loadCount };
}

function claudeOptions(root: string, tools: import("../../../src/model/runtime.ts").ToolDefinition[]) {
  return {
    runtime: "claude" as const,
    projectRoot: root,
    skillRoot: root,
    tools,
    interactionGate: createInteractionGate(),
    currentTurnId: () => undefined,
    judgeMode: true as const,
  };
}

test("Claude 判断模式：原生工具面清空、allowedTools 恰三只、WebSearch/写/shell 显式禁用", async () => {
  const project = await makeTempProject();
  try {
    const capture = claudeCapture();
    const tools = buildShellJudgeTools(judgeToolOptions(project.root));
    const session = await createClaudeRuntimeAdapter(claudeOptions(project.root, tools), capture.dependencies).bindRole(judgeRole());
    const prompt = session.prompt("判断这条命令");
    void prompt.catch(() => {});
    await until(() => capture.configurations.length === 1);
    const options = capture.configurations[0]!;
    assert.deepEqual(options.tools, [], "判断会话内置原生工具面必须清空");
    assert.deepEqual(options.allowedTools?.slice().sort(), [
      "mcp__ans__judge_list_dir",
      "mcp__ans__judge_read_file",
      "mcp__ans__report_shell_judgement",
    ]);
    assert.equal(options.allowedTools?.includes("WebSearch"), false, "判断会话不得放行 WebSearch");
    for (const disabled of ["WebSearch", "WebFetch", "Bash", "Write", "Edit", "Read", "Glob", "Grep", "Task"]) {
      assert.ok(options.disallowedTools?.includes(disabled), `必须显式禁用 ${disabled}`);
    }
    assert.equal(options.strictMcpConfig, true);
    assert.deepEqual(options.settingSources, []);
    assert.deepEqual(options.skills, []);
    assert.deepEqual(options.plugins, []);
    assert.deepEqual(Object.keys(options.mcpServers ?? {}), ["ans"], "外来 MCP 一律不装配");
    assert.equal(options.persistSession, false, "判断会话不得持久化");
    assert.match(String(options.systemPrompt), /只读判断会话/);
    assert.match(String(options.systemPrompt), /judge_read_file\/judge_list_dir/);
    // 关闭引擎：dispose 不应挂起。
    await session.dispose();
    await prompt.catch(() => {});
  } finally {
    await project.cleanup();
  }
});

test("Claude 判断模式：误注入写/编辑工具在 SDK 加载前抛错（零副作用）", async () => {
  const capture = claudeCapture();
  const root = process.cwd();
  const judge = buildShellJudgeTools(judgeToolOptions(root));
  const foreign = [
    ...judge,
    { name: "write_file", description: "x", inputSchema: { type: "object" }, async handler() { return { ok: true, message: "" }; } },
  ];
  assert.throws(
    () => createClaudeRuntimeAdapter(claudeOptions(root, foreign), capture.dependencies),
    /只接受.*judge_read_file/,
  );
  assert.equal(capture.loaded(), 0, "拒绝必须发生在 SDK 加载之前");
});

// —————————————————————— Codex（假引擎 + 内存 MCP 桩） ——————————————————————

const LIST_TOOLS = Symbol("listTools");
const CALL_TOOL = Symbol("callTool");

function stubMcpModules(): CodexMcpModules {
  const handlers = new Map<unknown, (request: unknown) => unknown>();
  class Server {
    constructor(_info: Record<string, unknown>, _options: Record<string, unknown>) {}
    setRequestHandler(schema: unknown, handler: (request: unknown) => unknown): void { handlers.set(schema, handler); }
    async connect(): Promise<void> {}
    async close(): Promise<void> {}
  }
  class Client {
    constructor(_info: Record<string, unknown>) {}
    async connect(): Promise<void> {}
    async close(): Promise<void> {}
    async listTools(): Promise<{ tools: Array<{ name: string }> }> {
      return await handlers.get(LIST_TOOLS)!({}) as { tools: Array<{ name: string }> };
    }
    async callTool(): Promise<{ isError: boolean; content: Array<{ type: string; text: string }> }> {
      return await handlers.get(CALL_TOOL)!(null) as { isError: boolean; content: Array<{ type: string; text: string }> };
    }
  }
  return {
    Server: Server as never,
    Client: Client as never,
    InMemoryTransport: { createLinkedPair: () => [{}, {}] },
    ListToolsRequestSchema: LIST_TOOLS,
    CallToolRequestSchema: CALL_TOOL,
  };
}

class FakeCodexEngine implements CodexRpcConnection {
  requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  input?: CodexEngineInput;
  closed = false;
  private listeners = new Set<(method: string, params: unknown) => void>();
  private handler?: Parameters<CodexRpcConnection["onServerRequest"]>[0];
  constructor(input: CodexEngineInput) { this.input = input; }
  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "initialize") return {};
    if (method === "config/read") {
      return {
        config: {
          features: Object.fromEntries(DISABLED_NATIVE_FEATURES.map((name) => [name, false])),
          sandbox_mode: "read-only",
          approval_policy: "never",
          web_search: "disabled",
          mcp_servers: {},
        },
      };
    }
    if (method === "thread/start" || method === "thread/resume") {
      return { thread: { id: "native-thread-1" }, sandbox: { type: "readOnly" }, approvalPolicy: "never" };
    }
    if (method === "mcpServerStatus/list") return { data: [], nextCursor: null };
    if (method === "turn/start") return { turn: { id: "native-turn-1", status: "inProgress" } };
    if (method === "turn/interrupt") { this.finish("interrupted"); return {}; }
    throw new Error(`unexpected fixture RPC ${method}`);
  }
  notify(): void {}
  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onServerRequest(handler: Parameters<CodexRpcConnection["onServerRequest"]>[0]): void { this.handler = handler; }
  async close(): Promise<void> { this.closed = true; }
  finish(status = "completed"): void {
    for (const listener of this.listeners) listener("turn/completed", { threadId: "native-thread-1", turn: { id: "native-turn-1", status } });
  }
  get serverHandler(): Parameters<CodexRpcConnection["onServerRequest"]>[0] | undefined { return this.handler; }
}

test("Codex 判断模式：仅注册三只 ans_ 判断工具、只读沙箱、网络关闭、写/shell 不存在", async () => {
  const project = await makeTempProject();
  try {
    const engine = new FakeCodexEngine({ cwd: project.root, nativeHome: path.join(project.root, ".codex"), env: {}, configOverrides: [], timeoutMs: 1000 });
    const options: CodexRuntimeAdapterOptions = {
      runtime: "codex",
      projectRoot: project.root,
      skillRoot: project.root,
      tools: buildShellJudgeTools(judgeToolOptions(project.root)),
      judgeMode: true,
      interactionGate: createInteractionGate(),
      currentTurnId: () => undefined,
      modelId: "fixture-model",
      env: { CODEX_API_KEY: "fixture-key", OPENAI_API_KEY: "fixture-key", PATH: process.env.PATH },
      engineFactory: async (input: CodexEngineInput) => { Object.assign(engine, { input }); return engine; },
      mcpLoader: async () => stubMcpModules(),
      webSearch: true,
    };
    const session = await createCodexRuntimeAdapter(options).bindRole(judgeRole());
    assert.ok(engine.input !== undefined);
    assert.ok(engine.input!.configOverrides.includes('web_search="disabled"'), "判断模式强制关闭 web search（忽略选项）");
    const thread = engine.requests.find((request) => request.method === "thread/start")!;
    const dynamic = (thread.params.dynamicTools as Array<{ name: string }>).map((tool) => tool.name).sort();
    assert.deepEqual(dynamic, ["ans_judge_list_dir", "ans_judge_read_file", "ans_report_shell_judgement"]);
    assert.equal(thread.params.sandbox, "read-only");
    assert.equal(thread.params.approvalPolicy, "never");
    assert.equal(thread.params.ephemeral, true, "判断会话不持久化");

    const { events, done } = await collect(session);
    const completion = session.prompt("判断");
    void completion.catch(() => {});
    await until(() => engine.requests.some((request) => request.method === "turn/start"));
    const started = engine.requests.find((request) => request.method === "turn/start")!;
    assert.deepEqual(started.params.sandboxPolicy, { type: "readOnly", networkAccess: false }, "只读沙箱、网络关闭");
    assert.equal(engine.serverHandler !== undefined, true);
    for (const name of ["ans_write_file", "ans_run_shell", "ans_web_search", "ans_dispatch_task", "ans_submit_report"]) {
      assert.equal(dynamic.includes(name), false, `${name} 不得注册`);
    }
    engine.finish();
    await completion;
    await session.dispose();
    await done;
    assert.ok(events.some((event) => event.kind === "settled"));
  } finally {
    await project.cleanup();
  }
});
