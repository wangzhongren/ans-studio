// 判断 agent（「替我审」）Pi 适配器模式测试（PM 评审 2026-10-17 §4.1/§6.1/§7.1）。
// 归属：Pi适配器角色测试目录。
//
// 两层证据（全部离线、无真实模型/网络/凭据）：
//   ① 假适配器（不 import Pi）：`shellJudge` 注入 ⇒ 恰三只只读工具；写/shell/交互/回交/派发
//      一律「未知工具」；`report_shell_judgement` 原样交回；未注入时普通路径逐字不变。
//   ② 真实适配器（pi-ai 内置 faux provider，进程内、keyless）：`judgeMode` ⇒ 只注册注入的三个
//      judge 工具、强制关闭服务端工具与外来 MCP、忽略持久化；非 judge 模式仍注册普通工具。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeRuntimeAdapter, createPiRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { buildShellJudgeTools, SHELL_JUDGE_TOOL_NAMES } from "../../src/provider/pi/tools.ts";
import { createRealPiRuntimeAdapter } from "../../src/common/pi-adapter/real-adapter.ts";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import type {
  RuntimeProviderOptions, RuntimeSessionStorage, SessionEvent, ShellJudgeReadStats, ToolDefinition,
} from "../../src/model/runtime.ts";
import { makeGate, makeRole } from "./fixtures.ts";

const log = { stage() {}, trace() {}, traceEnabled: false };

function stats(): ShellJudgeReadStats {
  return { readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false };
}

async function temp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "pi-shell-judge-"));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

async function drain(session: { events(): AsyncIterable<SessionEvent>; dispose(): Promise<void> }): Promise<SessionEvent[]> {
  await session.dispose();
  const events: SessionEvent[] = [];
  for await (const event of session.events()) events.push(event);
  return events;
}

// —————————————————————— ① 假适配器：结构性与回调 ——————————————————————

test("假适配器 judge 模式：只存在三只只读工具，写/shell/交互/回交/派发一律未知工具", async () => temp(async (dir) => {
  await writeFile(join(dir, "note.txt"), "项目说明：无需执行危险命令。\n", "utf8");
  const reported: unknown[] = [];
  const before = (await readdir(dir)).sort();
  const adapter = createFakeRuntimeAdapter({
    gate: makeGate({ skill: [], project: [] }),
    shellJudge: { projectRoot: dir, report: (raw) => { reported.push(raw); }, stats: stats() },
    script: [
      { name: "judge_list_dir", args: {} },
      { name: "judge_read_file", args: { path: "note.txt" } },
      { name: "report_shell_judgement", args: { verdict: "allow", reason: "该命令只读且必要" } },
      { name: "write_file", args: { path: "note.txt", content: "篡改" } },
      { name: "edit_file", args: { path: "note.txt", old_string: "a", new_string: "b" } },
      { name: "read_file", args: { path: "note.txt" } },
      { name: "run_shell", args: { command: "echo hi" } },
      { name: "request_confirmation", args: { title: "x" } },
      { name: "request_choice", args: { title: "x", options: [] } },
      { name: "submit_report", args: { status: "completed", summary: "x" } },
      { name: "dispatch_task", args: { roleId: "x", task: "y" } },
      { name: "report_shell_verdict", args: { verdict: "allow" } },
    ],
  });
  const session = await adapter.bindRole(makeRole());
  await session.prompt("请判断");
  const events = await drain(session);

  const accepted = events.filter((event) => event.kind === "accepted");
  const denied = events.filter((event) => event.kind === "denied");
  // 恰三只 judge 工具可执行（list/read/report）。
  assert.equal(accepted.length, 3);
  for (const message of accepted.map((event) => event.summary)) {
    assert.match(message, /judge_list_dir|judge_read_file|report_shell_judgement/);
  }
  // 其余九种（含同名的受治理读写工具）结构性不存在。
  assert.equal(denied.length, 9);
  for (const summary of denied.map((event) => event.summary)) {
    assert.match(summary, /未知工具，拒绝执行/);
  }
  // report 回调收到模型原始参数（不做规范化）。
  assert.deepEqual(reported, [{ verdict: "allow", reason: "该命令只读且必要" }]);
  // 只读：文件未变、未新增任何条目（不持久化、不写项目文件）。
  assert.equal(await readFile(join(dir, "note.txt"), "utf8"), "项目说明：无需执行危险命令。\n");
  assert.deepEqual((await readdir(dir)).sort(), before);
}));

test("假适配器未注入 shellJudge 时普通路径逐字不变（受治理工具仍在，judge 工具不存在）", async () => {
  const adapter = createFakeRuntimeAdapter({
    gate: makeGate({ skill: [], project: ["src/provider/pi/tools.ts"] }),
    script: [
      { name: "write_file", args: { path: "src/provider/pi/tools.ts", content: "// ok\n" } },
      { name: "report_shell_judgement", args: { verdict: "allow", reason: "x" } },
    ],
  });
  const session = await adapter.bindRole(makeRole());
  await session.prompt("普通会话");
  const events = await drain(session);

  const results = events.filter((event) => event.kind === "accepted" || event.kind === "denied");
  assert.equal(results.length, 2);
  // 普通路径：write_file 仍由门禁处理（未配置 writeRoot ⇒ 只判定、不落盘），不是「未知工具」。
  assert.match(results[0]!.summary, /未配置 writeRoot/);
  assert.doesNotMatch(results[0]!.summary, /未知工具/);
  // judge 专用工具在普通会话不存在。
  assert.match(results[1]!.summary, /未知工具，拒绝执行：report_shell_judgement/);
});

// —————————————————————— ② 真实适配器（faux，离线） ——————————————————————

async function engine() {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
  const runtime = await pi.ModelRuntime.create({
    credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false,
  });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id)!;
  let native: Awaited<ReturnType<typeof pi.createAgentSession>>["session"] | undefined;
  let constructed: Parameters<typeof pi.createAgentSession>[0];
  let mcpExtensionCalls = 0;
  const dependencies = {
    buildRuntime: async () => ({ runtime, model }),
    loadPi: async () => ({
      ...pi,
      createMcpExtension: (...args: Parameters<typeof pi.createMcpExtension>) => {
        mcpExtensionCalls += 1;
        return pi.createMcpExtension(...args);
      },
      async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) {
        constructed = input;
        const result = await pi.createAgentSession(input);
        native = result.session;
        return result;
      },
    }),
  };
  return { ai, faux, dependencies, get native() { return native!; }, get constructed() { return constructed!; }, get mcpExtensionCalls() { return mcpExtensionCalls; } };
}

function providerOptions(projectRoot: string, tools: readonly ToolDefinition[], extra: Partial<RuntimeProviderOptions> = {}): RuntimeProviderOptions {
  return {
    runtime: "pi", projectRoot, skillRoot: projectRoot, tools,
    interactionGate: createInteractionGate(), currentTurnId: () => "judge-turn",
    promptTimeoutMs: 1000, turnLastResortMs: 5000,
    ...extra,
  };
}

const judgeConfig = resolvePiProviderConfig({
  providerId: "pi-judge-faux", baseUrl: "https://judge.invalid/", modelId: "judge-model",
  apiKeyEnvVar: "PI_JUDGE_FAKE_CREDENTIAL", contextWindow: 32768,
}, { PI_JUDGE_FAKE_CREDENTIAL: "offline-placeholder" });

test("真实适配器 judgeMode：恰三只 judge 工具、原生/服务端/MCP 关闭、无持久化", async (t) => {
  let sdk: Awaited<ReturnType<typeof engine>>;
  try { sdk = await engine(); } catch { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const reported: unknown[] = [];
    const judgeTools = buildShellJudgeTools({ projectRoot: dir, report: (raw) => { reported.push(raw); }, stats: stats() });
    // 诱饵：宿主 env 打开服务端工具（未知 id 在普通模式下会构造期抛错）、调用方误传 MCP 与旧 sessionDir。
    const previous = process.env.ANS_PI_SERVER_TOOLS;
    process.env.ANS_PI_SERVER_TOOLS = "definitely-unknown-server-tool";
    try {
      sdk.faux.setResponses([
        sdk.ai.fauxAssistantMessage([
          sdk.ai.fauxToolCall("judge_read_file", { path: "note.txt" }),
          sdk.ai.fauxToolCall("report_shell_judgement", { verdict: "allow", reason: "只读且必要" }),
        ]),
        sdk.ai.fauxAssistantMessage("done"),
      ]);
      await writeFile(join(dir, "note.txt"), "判断上下文\n", "utf8");
      let storageTouched = 0;
      const storage: RuntimeSessionStorage = {
        runtime: "pi", roleId: "Pi适配器",
        directory: join(dir, ".ans"), nativeDirectory: join(dir, ".ans", "native"),
        async readLatest() { storageTouched += 1; throw new Error("judge 模式不得读存储"); },
        async saveSession() { storageTouched += 1; throw new Error("judge 模式不得写存储"); },
        async appendReplay() { storageTouched += 1; throw new Error("judge 模式不得写 replay"); },
        async readReplay() { storageTouched += 1; throw new Error("judge 模式不得读 replay"); },
        async checkpointReplay() { storageTouched += 1; throw new Error("judge 模式不得读 checkpoint"); },
      };
      const session = await createRealPiRuntimeAdapter({
        ...providerOptions(dir, judgeTools, {
          judgeMode: true as const,
          installedMcpServers: [{ name: "decoy", command: "definitely-not-a-real-binary", args: [] }],
          storage,
        }),
        config: judgeConfig, logger: log, sessionDir: join(dir, ".ans", "sessions", "judge"),
      }, sdk.dependencies).bindRole(makeRole());

      // 判断会话的工具面恰为运行时核心的三只只读工具（无 native、无 MCP、无服务端工具、无写/shell）。
      assert.deepEqual([...sdk.native.getActiveToolNames()].sort(), [...SHELL_JUDGE_TOOL_NAMES].sort());
      assert.equal(sdk.constructed.noTools, "builtin");
      assert.equal(sdk.mcpExtensionCalls, 0, "judge 模式不得装配外来 MCP");
      await session.prompt("判断这条命令");
      const events = await drain(session);
      assert.deepEqual(reported, [{ verdict: "allow", reason: "只读且必要" }]);
      assert.equal(events.some((event) => /服务端工具/.test(event.summary)), false, "judge 模式不得启用服务端工具");
      // 不持久化：ignored storage/sessionDir ⇒ in-memory，且项目内不出现 .ans。
      assert.equal(storageTouched, 0, "judge 模式不得触碰 storage");
      assert.equal(session.contextSource, "in-memory");
      assert.equal((await readdir(dir)).includes(".ans"), false);
    } finally {
      if (previous === undefined) delete process.env.ANS_PI_SERVER_TOOLS;
      else process.env.ANS_PI_SERVER_TOOLS = previous;
    }
  });
});

test("真实适配器 judgeMode：注入非 judge 工具在构造期被拒绝（写/shell 根本不存在）", async (t) => {
  let sdk: Awaited<ReturnType<typeof engine>>;
  try { sdk = await engine(); } catch { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const judgeTools = buildShellJudgeTools({ projectRoot: dir, report: () => {}, stats: stats() });
    const foreign: ToolDefinition = {
      name: "write_file", description: "forbidden", inputSchema: { type: "object" },
      async handler() { return { ok: true, message: "should never run" }; },
    };
    await assert.rejects(
      createRealPiRuntimeAdapter({
        ...providerOptions(dir, [...judgeTools, foreign], { judgeMode: true as const }),
        config: judgeConfig, logger: log,
      }, sdk.dependencies).bindRole(makeRole()),
      /判断会话只允许 judge 只读工具/,
    );
  });
});

test("真实适配器未置 judgeMode 时普通工具集不变（注入工具照常注册）", async (t) => {
  let sdk: Awaited<ReturnType<typeof engine>>;
  try { sdk = await engine(); } catch { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const marker: ToolDefinition = {
      name: "ans_marker", description: "ordinary governed tool", inputSchema: { type: "object" },
      async handler() { return { ok: true, message: "ok" }; },
    };
    const session = await createRealPiRuntimeAdapter({
      ...providerOptions(dir, [marker]), config: judgeConfig, logger: log,
    }, sdk.dependencies).bindRole(makeRole());
    assert.deepEqual(sdk.native.getActiveToolNames(), ["ans_marker"]);
    assert.equal(session.contextSource, "in-memory");
    await session.dispose();
  });
});

// —————————————————————— ③ legacy 直接入口（createPiRuntimeAdapter） ——————————————————————

test("createPiRuntimeAdapter legacy 判断模式：只用 buildShellJudgeTools，不构造受治理工具", async (t) => {
  const previousCredential = process.env.PI_JUDGE_FAKE_CREDENTIAL;
  process.env.PI_JUDGE_FAKE_CREDENTIAL = "offline-placeholder";
  try {
    let sdk: Awaited<ReturnType<typeof engine>>;
    try { sdk = await engine(); } catch { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
    await temp(async (dir) => {
      const reported: unknown[] = [];
      sdk.faux.setResponses([
        sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall("report_shell_judgement", { verdict: "deny", reason: "不必要" })]),
        sdk.ai.fauxAssistantMessage("done"),
      ]);
      const adapter = createPiRuntimeAdapter({
        gate: makeGate({ skill: [], project: [] }),
        projectRoot: dir, skillRoot: dir,
        providerId: "pi-judge-faux", baseUrl: "https://judge.invalid/", modelId: "judge-model",
        apiKeyEnvVar: "PI_JUDGE_FAKE_CREDENTIAL", contextWindow: 32768,
        shellJudge: { projectRoot: dir, report: (raw) => { reported.push(raw); }, stats: stats() },
        dependencies: sdk.dependencies,
      });
      const session = await adapter.bindRole(makeRole());
      assert.deepEqual([...sdk.native.getActiveToolNames()].sort(), [...SHELL_JUDGE_TOOL_NAMES].sort());
      assert.equal(sdk.native.getActiveToolNames().includes("write_file"), false);
      assert.equal(sdk.native.getActiveToolNames().includes("run_shell"), false);
      await session.prompt("判断");
      await drain(session);
      assert.deepEqual(reported, [{ verdict: "deny", reason: "不必要" }]);
      assert.equal(session.contextSource, "in-memory");
      assert.equal((await readdir(dir)).includes(".ans"), false);
    });
  } finally {
    if (previousCredential === undefined) delete process.env.PI_JUDGE_FAKE_CREDENTIAL;
    else process.env.PI_JUDGE_FAKE_CREDENTIAL = previousCredential;
  }
});

test("createPiRuntimeAdapter legacy 普通模式：未注入 shellJudge 时仍构造受治理工具集", async (t) => {
  const previousCredential = process.env.PI_JUDGE_FAKE_CREDENTIAL;
  process.env.PI_JUDGE_FAKE_CREDENTIAL = "offline-placeholder";
  try {
    let sdk: Awaited<ReturnType<typeof engine>>;
    try { sdk = await engine(); } catch { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
    await temp(async (dir) => {
      const adapter = createPiRuntimeAdapter({
        gate: makeGate({ skill: [], project: [] }),
        projectRoot: dir, skillRoot: dir,
        providerId: "pi-judge-faux", baseUrl: "https://judge.invalid/", modelId: "judge-model",
        apiKeyEnvVar: "PI_JUDGE_FAKE_CREDENTIAL", contextWindow: 32768,
        dependencies: sdk.dependencies,
      });
      const session = await adapter.bindRole(makeRole());
      const names = sdk.native.getActiveToolNames();
      assert.ok(names.includes("write_file"));
      assert.ok(names.includes("edit_file"));
      assert.ok(names.includes("read_file"));
      assert.equal(names.includes("report_shell_judgement"), false);
      await session.dispose();
    });
  } finally {
    if (previousCredential === undefined) delete process.env.PI_JUDGE_FAKE_CREDENTIAL;
    else process.env.PI_JUDGE_FAKE_CREDENTIAL = previousCredential;
  }
});
