// 治理卡判断 agent（「替我审批」/「替我决策」）Pi 适配器模式测试
// （2026-10-18 双开关评审 §6.2/§六/§十二 P3b）。
// 归属：Pi适配器角色测试目录。
//
// 三层证据（全部离线、无真实模型/网络/凭据）：
//   ① 工具集常量：`buildGovernanceJudgeTools` 恰三只治理工具、`buildShellJudgeTools` 仍恰三只
//      shell 工具、`ALL_JUDGE_TOOL_NAMES` 恰为并集（只用于 allowlist，不用于装配）。
//   ② 假适配器（不 import Pi）：`governanceJudge` 注入 ⇒ 恰三只治理工具可执行；写/shell/交互/
//      回交/派发/审读一律「未知工具」；`report_governance_judgement` 原样回调；未注入时普通路径不变；
//      两种判断能力同时注入 ⇒ 互斥抛错。
//   ③ 真实适配器（pi-ai 内置 faux provider，进程内、keyless）：`judgeMode` + 治理工具 ⇒ 只注册
//      注入的三只治理工具、强制关闭服务端工具与外来 MCP、忽略持久化；注入非 judge 工具构造期被拒；
//      legacy `createPiRuntimeAdapter` 的 `governanceJudge` 直连分支同样只构造三只治理工具。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeRuntimeAdapter, createPiRuntimeAdapter } from "../../src/provider/pi/session.ts";
import {
  ALL_JUDGE_TOOL_NAMES,
  buildGovernanceJudgeTools,
  buildShellJudgeTools,
  GOVERNANCE_JUDGE_REPORT_TOOL,
  GOVERNANCE_JUDGE_TOOL_NAMES,
  SHELL_JUDGE_REPORT_TOOL,
  SHELL_JUDGE_TOOL_NAMES,
} from "../../src/provider/pi/tools.ts";
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
  const directory = await mkdtemp(join(tmpdir(), "pi-governance-judge-"));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

async function drain(session: { events(): AsyncIterable<SessionEvent>; dispose(): Promise<void> }): Promise<SessionEvent[]> {
  await session.dispose();
  const events: SessionEvent[] = [];
  for await (const event of session.events()) events.push(event);
  return events;
}

// —————————————————————— ① 工具集常量（装配面钉死） ——————————————————————

test("judge 工具集：治理恰三只、shell 仍恰三只、并集恰四只（并集只用于 allowlist）", async () => temp(async (dir) => {
  const shellNames = buildShellJudgeTools({ projectRoot: dir, report: () => {}, stats: stats() }).map((tool) => tool.name);
  const governanceNames = buildGovernanceJudgeTools({ projectRoot: dir, report: () => {}, stats: stats() }).map((tool) => tool.name);

  assert.deepEqual([...shellNames].sort(), [...SHELL_JUDGE_TOOL_NAMES].sort());
  assert.deepEqual([...governanceNames].sort(), [...GOVERNANCE_JUDGE_TOOL_NAMES].sort());
  // 治理工具集恰三只且 report 为治理专用；shell 的 report 不出现在治理装配里。
  assert.equal(governanceNames.length, 3);
  assert.equal(governanceNames.includes(SHELL_JUDGE_REPORT_TOOL), false);
  assert.equal(governanceNames.includes(GOVERNANCE_JUDGE_REPORT_TOOL), true);
  // 并集 = 双方去重并集；shell 会话与治理会话各自的装配面都不变。
  const union = [...new Set([...SHELL_JUDGE_TOOL_NAMES, ...GOVERNANCE_JUDGE_TOOL_NAMES])].sort();
  assert.deepEqual([...ALL_JUDGE_TOOL_NAMES].sort(), union);
  assert.equal(ALL_JUDGE_TOOL_NAMES.length, 4);
}));

// —————————————————————— ② 假适配器：结构性与回调 ——————————————————————

test("假适配器治理 judge 模式：只存在三只治理只读工具，写/shell/交互/回交/派发/审读一律未知工具", async () => temp(async (dir) => {
  await writeFile(join(dir, "proposal.md"), "# 提案\n\n范围：只读判断。\n", "utf8");
  const reported: unknown[] = [];
  const before = (await readdir(dir)).sort();
  const adapter = createFakeRuntimeAdapter({
    gate: makeGate({ skill: [], project: [] }),
    governanceJudge: { projectRoot: dir, report: (raw) => { reported.push(raw); }, stats: stats() },
    script: [
      { name: "judge_list_dir", args: {} },
      { name: "judge_read_file", args: { path: "proposal.md" } },
      { name: "report_governance_judgement", args: { verdict: "approve", reason: "只读且证据齐全", evidence: ["proposal.md"] } },
      { name: "report_shell_judgement", args: { verdict: "allow", reason: "x" } },
      { name: "write_file", args: { path: "proposal.md", content: "篡改" } },
      { name: "edit_file", args: { path: "proposal.md", old_string: "a", new_string: "b" } },
      { name: "read_file", args: { path: "proposal.md" } },
      { name: "run_shell", args: { command: "echo hi" } },
      { name: "request_confirmation", args: { title: "x" } },
      { name: "request_choice", args: { title: "x", options: [] } },
      { name: "submit_report", args: { status: "completed", summary: "x" } },
      { name: "dispatch_task", args: { roleId: "x", task: "y" } },
      { name: "report_shell_verdict", args: { verdict: "allow" } },
    ],
  });
  const session = await adapter.bindRole(makeRole());
  await session.prompt("请判断这张治理卡");
  const events = await drain(session);

  const accepted = events.filter((event) => event.kind === "accepted");
  const denied = events.filter((event) => event.kind === "denied");
  // 恰三只治理 judge 工具可执行（list/read/report）。
  assert.equal(accepted.length, 3);
  for (const message of accepted.map((event) => event.summary)) {
    assert.match(message, /judge_list_dir|judge_read_file|report_governance_judgement/);
  }
  // 其余十种（含 shell judge 的 report 与同名受治理读写工具）结构性不存在。
  assert.equal(denied.length, 10);
  for (const summary of denied.map((event) => event.summary)) {
    assert.match(summary, /未知工具，拒绝执行/);
  }
  // report 回调收到模型原始参数（不做规范化/不裁剪）。
  assert.deepEqual(reported, [{ verdict: "approve", reason: "只读且证据齐全", evidence: ["proposal.md"] }]);
  // 只读：文件未变、未新增任何条目（不持久化、不写项目文件）。
  assert.equal(await readFile(join(dir, "proposal.md"), "utf8"), "# 提案\n\n范围：只读判断。\n");
  assert.deepEqual((await readdir(dir)).sort(), before);
}));

test("假适配器同时注入 shellJudge 与 governanceJudge：互斥抛错（不静默择一）", async () => temp(async (dir) => {
  const adapter = createFakeRuntimeAdapter({
    gate: makeGate({ skill: [], project: [] }),
    shellJudge: { projectRoot: dir, report: () => {}, stats: stats() },
    governanceJudge: { projectRoot: dir, report: () => {}, stats: stats() },
  });
  await assert.rejects(adapter.bindRole(makeRole()), /shellJudge 与 governanceJudge 互斥/);
}));

test("假适配器普通路径（未注入判断能力）：受治理工具仍在，治理/shell judge 工具都不存在", async () => {
  const adapter = createFakeRuntimeAdapter({
    gate: makeGate({ skill: [], project: ["src/provider/pi/tools.ts"] }),
    script: [
      { name: "write_file", args: { path: "src/provider/pi/tools.ts", content: "// ok\n" } },
      { name: "report_governance_judgement", args: { verdict: "approve" } },
      { name: "report_shell_judgement", args: { verdict: "allow", reason: "x" } },
    ],
  });
  const session = await adapter.bindRole(makeRole());
  await session.prompt("普通会话");
  const events = await drain(session);

  const results = events.filter((event) => event.kind === "accepted" || event.kind === "denied");
  assert.equal(results.length, 3);
  // 普通路径：write_file 仍由门禁处理（未配置 writeRoot ⇒ 只判定、不落盘），不是「未知工具」。
  assert.match(results[0]!.summary, /未配置 writeRoot/);
  assert.doesNotMatch(results[0]!.summary, /未知工具/);
  // 两类 judge 专用工具在普通会话都不存在。
  assert.match(results[1]!.summary, /未知工具，拒绝执行：report_governance_judgement/);
  assert.match(results[2]!.summary, /未知工具，拒绝执行：report_shell_judgement/);
});

// —————————————————————— ③ 真实适配器（faux，离线） ——————————————————————

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
    interactionGate: createInteractionGate(), currentTurnId: () => "governance-judge-turn",
    promptTimeoutMs: 1000, turnLastResortMs: 5000,
    ...extra,
  };
}

const judgeConfig = resolvePiProviderConfig({
  providerId: "pi-governance-judge-faux", baseUrl: "https://judge.invalid/", modelId: "judge-model",
  apiKeyEnvVar: "PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL", contextWindow: 32768,
}, { PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL: "offline-placeholder" });

test("真实适配器 judgeMode + 治理工具：恰三只治理工具、原生/服务端/MCP 关闭、无持久化、report 原样", async (t) => {
  let sdk: Awaited<ReturnType<typeof engine>>;
  try { sdk = await engine(); } catch { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const reported: unknown[] = [];
    const judgeTools = buildGovernanceJudgeTools({ projectRoot: dir, report: (raw) => { reported.push(raw); }, stats: stats() });
    // 诱饵：宿主 env 打开服务端工具（未知 id 在普通模式下会构造期抛错）、调用方误传 MCP 与旧 sessionDir。
    const previous = process.env.ANS_PI_SERVER_TOOLS;
    process.env.ANS_PI_SERVER_TOOLS = "definitely-unknown-server-tool";
    try {
      const rawReport = { verdict: "approve", selected: ["accept"], evidence: ["proposal.md"], extra: { nested: 1 } };
      sdk.faux.setResponses([
        sdk.ai.fauxAssistantMessage([
          sdk.ai.fauxToolCall("judge_read_file", { path: "proposal.md" }),
          sdk.ai.fauxToolCall("report_governance_judgement", rawReport),
        ]),
        sdk.ai.fauxAssistantMessage("done"),
      ]);
      await writeFile(join(dir, "proposal.md"), "# 提案\n", "utf8");
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

      // 治理判断会话的工具面恰为三只治理只读工具（无 native、无 MCP、无服务端工具、无写/shell）。
      assert.deepEqual([...sdk.native.getActiveToolNames()].sort(), [...GOVERNANCE_JUDGE_TOOL_NAMES].sort());
      assert.equal(sdk.constructed.noTools, "builtin");
      assert.equal(sdk.mcpExtensionCalls, 0, "judge 模式不得装配外来 MCP");
      await session.prompt("判断这张治理卡");
      const events = await drain(session);
      assert.deepEqual(reported, [rawReport]);
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
    const judgeTools = buildGovernanceJudgeTools({ projectRoot: dir, report: () => {}, stats: stats() });
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

// —————————————————————— ④ legacy 直接入口（createPiRuntimeAdapter） ——————————————————————

test("createPiRuntimeAdapter legacy 注入 governanceJudge：只构造治理三工具，不构造受治理工具、无持久化", async (t) => {
  const previousCredential = process.env.PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL;
  process.env.PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL = "offline-placeholder";
  try {
    let sdk: Awaited<ReturnType<typeof engine>>;
    try { sdk = await engine(); } catch { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
    await temp(async (dir) => {
      const reported: unknown[] = [];
      const rawReport = { verdict: "manual", reason: "证据不足" };
      sdk.faux.setResponses([
        sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall("report_governance_judgement", rawReport)]),
        sdk.ai.fauxAssistantMessage("done"),
      ]);
      const adapter = createPiRuntimeAdapter({
        gate: makeGate({ skill: [], project: [] }),
        projectRoot: dir, skillRoot: dir,
        providerId: "pi-governance-judge-faux", baseUrl: "https://judge.invalid/", modelId: "judge-model",
        apiKeyEnvVar: "PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL", contextWindow: 32768,
        governanceJudge: { projectRoot: dir, report: (raw) => { reported.push(raw); }, stats: stats() },
        dependencies: sdk.dependencies,
      });
      const session = await adapter.bindRole(makeRole());
      assert.deepEqual([...sdk.native.getActiveToolNames()].sort(), [...GOVERNANCE_JUDGE_TOOL_NAMES].sort());
      assert.equal(sdk.native.getActiveToolNames().includes("write_file"), false);
      assert.equal(sdk.native.getActiveToolNames().includes("run_shell"), false);
      assert.equal(sdk.native.getActiveToolNames().includes(SHELL_JUDGE_REPORT_TOOL), false);
      await session.prompt("判断");
      await drain(session);
      assert.deepEqual(reported, [rawReport]);
      assert.equal(session.contextSource, "in-memory");
      assert.equal((await readdir(dir)).includes(".ans"), false);
    });
  } finally {
    if (previousCredential === undefined) delete process.env.PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL;
    else process.env.PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL = previousCredential;
  }
});

test("createPiRuntimeAdapter legacy 同时注入两种判断能力：构造期互斥抛错", () => {
  const previousCredential = process.env.PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL;
  process.env.PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL = "offline-placeholder";
  try {
    assert.throws(() => createPiRuntimeAdapter({
      gate: makeGate({ skill: [], project: [] }),
      projectRoot: process.cwd(), skillRoot: process.cwd(),
      providerId: "pi-governance-judge-faux", baseUrl: "https://judge.invalid/", modelId: "judge-model",
      apiKeyEnvVar: "PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL", contextWindow: 32768,
      shellJudge: { projectRoot: process.cwd(), report: () => {}, stats: stats() },
      governanceJudge: { projectRoot: process.cwd(), report: () => {}, stats: stats() },
    }), /shellJudge 与 governanceJudge 互斥/);
  } finally {
    if (previousCredential === undefined) delete process.env.PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL;
    else process.env.PI_GOVERNANCE_JUDGE_FAKE_CREDENTIAL = previousCredential;
  }
});
