// S5：三引擎（Claude / Codex / Pi）经注入的 options.tools 实际注册/可见四个后台任务工具。
// 适配器零改动；本文件只消费各适配器公开工厂与既有离线夹具（Claude 用假 SDK，Codex/Pi 用假引擎）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as zod from "zod";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { createPiRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { createBackgroundTaskManager } from "../../src/common/runtime-core/background-tasks.ts";
import { createInteractionGate } from "../../src/common/runtime-core/timeout.ts";
import type { InteractionGate, RuntimeProviderOptions, ToolDefinition } from "../../src/model/runtime.ts";
import { allow, role } from "./fixtures.ts";
import { allowShellGate, boundMs, waitUntil } from "./background-fixtures.ts";
import { harness as codexHarness, options as codexOptions, role as codexRole, start as startCodex } from "../codex-adapter/fixtures.ts";

const BACKGROUND_TOOL_NAMES = [
  "start_background_task",
  "list_background_tasks",
  "read_background_task",
  "stop_background_task",
] as const;

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-bg-engines-"));

function governedTools(root: string): { tools: ToolDefinition[]; dispose: () => Promise<void> } {
  const manager = createBackgroundTaskManager();
  const tools = buildGovernedTools(allow, { shellGate: allowShellGate, shellCwd: root, backgroundTasks: manager });
  return { tools, dispose: () => manager.dispose() };
}

function gate(): InteractionGate {
  let waiting = 0;
  const listeners = new Set<(waiting: boolean) => void>();
  return {
    begin() { waiting += 1; for (const listener of listeners) listener(true); },
    end() { waiting = Math.max(0, waiting - 1); for (const listener of listeners) listener(waiting > 0); },
    isWaiting: () => waiting > 0,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

test("S5 Claude：SDK MCP registerTool 实际收到四个后台工具", async () => {
  const root = await temp();
  const governed = governedTools(root);
  const registered: string[] = [];
  const fakeSdk = {
    createSdkMcpServer() {
      return { instance: { registerTool(name: string) { registered.push(name); } }, timeout: 0 };
    },
    query() {
      return {
        async *[Symbol.asyncIterator]() { /* 不产帧；本轮由 dispose 收口 */ },
        close() {},
        async interrupt() {},
        async mcpServerStatus() { return []; },
      };
    },
  };
  try {
    const adapter = createClaudeRuntimeAdapter({
      runtime: "claude", projectRoot: root, skillRoot: root, tools: governed.tools,
      interactionGate: gate(), currentTurnId: () => "claude-turn",
    }, {
      env: { ANTHROPIC_API_KEY: "fixture-claude-key", PATH: process.env.PATH, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) },
      loadSdk: async () => fakeSdk as never,
      loadZod: async () => zod as never,
    });
    const session = await adapter.bindRole(role());
    const prompt = session.prompt("fixture").catch(() => {});
    await waitUntil(() => BACKGROUND_TOOL_NAMES.every((name) => registered.includes(name)), boundMs);
    for (const name of BACKGROUND_TOOL_NAMES) assert.equal(registered.includes(name), true, `Claude 未注册 ${name}`);
    await session.dispose();
    await prompt;
  } finally {
    await governed.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("S5 Codex：thread/start 的 dynamicTools 实际包含四个后台工具", async () => {
  const root = await temp();
  const governed = governedTools(root);
  const engines = codexHarness();
  try {
    const adapter = createCodexRuntimeAdapter(codexOptions(root, engines, { tools: governed.tools }));
    const session = await adapter.bindRole(codexRole);
    const { completion } = await startCodex(session, engines.engine);
    const thread = engines.engine.requests.find((request) => request.method === "thread/start");
    assert.ok(thread, "应发出 thread/start");
    const dynamic = (thread.params.dynamicTools ?? []) as Array<{ name?: string }>;
    const names = dynamic.map((tool) => tool.name);
    for (const name of BACKGROUND_TOOL_NAMES) assert.equal(names.includes(`ans_${name}`), true, `Codex dynamicTools 缺少 ans_${name}`);
    engines.engine.finish("completed");
    await completion.catch(() => {});
    await session.dispose();
  } finally {
    await governed.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("S5 Pi：生产入口（\"tools\" in adapterInput）把四个后台工具注册为 customTools", async () => {
  const root = await temp();
  const governed = governedTools(root);
  const credential = "P1_BACKGROUND_FIXTURE_CREDENTIAL";
  const previous = process.env[credential];
  process.env[credential] = "offline-placeholder";
  try {
    const pi = await import("@earendil-works/pi-coding-agent");
    const ai = await import("@earendil-works/pi-ai");
    const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
    const runtime = await pi.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
    runtime.registerNativeProvider(faux.provider);
    const model = runtime.getModel(faux.provider.id, faux.models[0].id)!;
    let constructed: Parameters<typeof pi.createAgentSession>[0] | undefined;
    const dependencies = {
      buildRuntime: async () => ({ runtime, model }),
      loadPi: async () => ({
        ...pi,
        async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) {
          constructed = input;
          return pi.createAgentSession(input);
        },
      }),
    };
    const options = {
      runtime: "pi" as const,
      projectRoot: root,
      skillRoot: root,
      tools: governed.tools,
      interactionGate: createInteractionGate(),
      currentTurnId: () => "pi-turn",
      providerId: "p1-background-fixture",
      baseUrl: "https://p1.invalid/",
      modelId: "p1-model",
      apiKeyEnvVar: credential,
      contextWindow: 32768,
      dependencies,
    } satisfies RuntimeProviderOptions & { dependencies: typeof dependencies; contextWindow: number };
    const adapter = createPiRuntimeAdapter(options);
    const session = await adapter.bindRole(role());
    assert.ok(constructed, "生产入口应调用 createAgentSession");
    const customTools = (constructed.customTools ?? []) as Array<{ name?: string }>;
    const names = customTools.map((tool) => tool.name);
    for (const name of BACKGROUND_TOOL_NAMES) assert.equal(names.includes(name), true, `Pi customTools 缺少 ${name}`);
    await session.dispose();
  } finally {
    if (previous === undefined) delete process.env[credential];
    else process.env[credential] = previous;
    await governed.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
