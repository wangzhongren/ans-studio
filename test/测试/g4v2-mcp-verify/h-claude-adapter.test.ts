// test/测试/g4v2-mcp-verify/h-claude-adapter.test.ts —— G2 域：Claude P1 装配/放行/审计/status/env 展开。
//
// 独立构造：自建假 SDK（只替 transport：query 捕获 Options 并脚本化 hooks/frames），不 import 实施方测试；
// 对抗点：hook 放行五条件逐条反例（名错位/近似前缀/未绑定轮/中止信号/source 非 dynamic）、**不得注入
// updatedInput**、审计两行配对、status 行类别化无正文、env:NAME 展开（缺失省略）与 PASSTHROUGH 名单。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { Options, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import { createClaudeRuntimeAdapter } from "../../../src/provider/claude/session.ts";
import { createToolDisplayContext } from "../../../src/common/runtime-core/tool-display.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";
import type { InteractionGate, RuntimeProviderOptions, SessionEvent, ToolDefinition } from "../../../src/model/runtime.ts";
import { makeRoot } from "./helpers.ts";

/** 最小交互闸（waitForTurn 需要）：无交互卡场景恒不 waiting。 */
function noopGate(): InteractionGate {
  let waiting = 0;
  const listeners = new Set<(waiting: boolean) => void>();
  const emit = (): void => { for (const listener of listeners) listener(waiting > 0); };
  return {
    begin() { waiting += 1; emit(); },
    end() { waiting = Math.max(0, waiting - 1); emit(); },
    isWaiting: () => waiting > 0,
    onChange(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

const LAUNCHER_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "src", "common", "claude-adapter", "mcp-launcher.mjs");

const role: ResolvedRole = {
  id: "claude-fixture",
  kind: "project",
  cardText: "# fixture",
  boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
  boundarySource: "fixture",
  location: { card: "fixture", boundary: "fixture" },
};

const ENV: Record<string, string | undefined> = {
  ANTHROPIC_API_KEY: "fixture-key",
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  BASE_LOCATOR: "base-locator-value",
};

type HookFn = NonNullable<NonNullable<Options["hooks"]>["PreToolUse"]>[number]["hooks"][number];

/** 自建假 SDK：捕获 options、脚本化 hook 电池与消息帧；仅替 transport。 */
function makeEngine() {
  const configurations: Options[] = [];
  let statusEntries: unknown[] = [];
  let statusCalls = 0;
  let statusThrows = false;
  let script: ((ctx: { opts: Options; user: SDKUserMessage; nativePromptId: string }) => Promise<unknown[] | void>) | undefined;

  const query = ({ prompt, options }: { prompt: AsyncIterable<SDKUserMessage>; options?: Options }) => {
    const opts = options!;
    configurations.push(opts);
    const nativeId = opts.resume ?? "native-fixture-id";
    let closed = false;
    let promptCounter = 0;
    const generator = (async function* () {
      for await (const user of prompt) {
        const nativePromptId = `native-prompt-${++promptCounter}`; // 每轮唯一（真实 CLI 亦为每轮新 id）
        const content = user.message.content;
        const text = typeof content === "string" ? content : content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
        const submit = opts.hooks!.UserPromptSubmit![0]!.hooks[0]!;
        await submit({ hook_event_name: "UserPromptSubmit", prompt_id: nativePromptId, prompt: text, session_id: "f", transcript_path: "f", cwd: String(opts.cwd) }, undefined, { signal: opts.abortController!.signal });
        const frames = script ? await script({ opts, user, nativePromptId }) : undefined;
        for (const frame of frames ?? []) yield frame;
        yield { type: "result", subtype: "success", is_error: false, session_id: nativeId, user_message_uuid: user.uuid };
      }
      void closed;
    })();
    return Object.assign(generator, {
      async interrupt() {},
      close() { closed = true; },
      async mcpServerStatus() {
        statusCalls += 1;
        if (statusThrows) throw new Error("status query fixture failure");
        return statusEntries;
      },
    });
  };
  const dependencies = {
    env: ENV,
    loadSdk: async () => ({
      query: query as never,
      createSdkMcpServer: (() => ({ timeout: 0, instance: { registerTool() {} } })) as never,
    }),
    loadZod: async () => (await import("zod")) as never,
  };
  return {
    configurations,
    dependencies,
    get statusCalls() { return statusCalls; },
    setStatus(entries: unknown[]) { statusEntries = entries; },
    setStatusThrows(v: boolean) { statusThrows = v; },
    setScript(fn: typeof script) { script = fn; },
  };
}

const probeTool = (): ToolDefinition => ({ name: "probe", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "probe" }) });

function options(root: string, tools: readonly ToolDefinition[], installed?: RuntimeProviderOptions["installedMcpServers"]): RuntimeProviderOptions {
  return {
    runtime: "claude",
    projectRoot: root,
    skillRoot: root,
    tools,
    currentTurnId: () => "turn-1",
    promptTimeoutMs: 3000,
    interactionGate: noopGate(),
    ...(installed !== undefined ? { installedMcpServers: installed } : {}),
  };
}

async function collectUntilSettled(session: { events(): AsyncIterable<SessionEvent> }): Promise<SessionEvent[]> {
  const rows: SessionEvent[] = [];
  for await (const event of session.events()) {
    rows.push(event);
    if (event.kind === "settled") return rows;
  }
  return rows;
}

const preHook = (opts: Options): HookFn => opts.hooks!.PreToolUse![0]!.hooks[0]!;

function hookArgs(overrides: Partial<Parameters<HookFn>[0]> & { prompt_id?: string | undefined }): Parameters<HookFn>[0] {
  return {
    hook_event_name: "PreToolUse", session_id: "f", transcript_path: "f", cwd: "/",
    tool_name: "mcp__ext__echo", tool_input: { a: 1 }, tool_use_id: "tu-1",
    ...overrides,
  } as Parameters<HookFn>[0];
}

test("H1 装配：launcher 包装命令/alwaysLoad/工具级 timeout；allowedTools 加 server 级名；env:NAME 展开（缺失省略）", async () => {
  const root = makeRoot();
  try {
    const engine = makeEngine();
    const session = await createClaudeRuntimeAdapter(
      options(root, [probeTool()], [{ name: "ext", command: "/usr/bin/ext-bin", args: ["--a", "b"], env: { TOK: "env:BASE_LOCATOR", MISS: "env:NOT_SET_ANYWHERE", LIT: "literal" } }]),
      engine.dependencies,
    ).bindRole(role);
    engine.setScript(async () => []);
    await session.prompt("hello");
    const config = engine.configurations[0]!;
    const servers = config.mcpServers as Record<string, Record<string, unknown>>;
    assert.ok(servers["ans"], "ans 内置 server 照旧注程");
    const ext = servers["ext"]!;
    assert.equal(ext["type"], "stdio");
    assert.equal(ext["command"], process.execPath, "命令恒为 launcher 宿主（process.execPath）");
    assert.deepEqual(ext["args"], [LAUNCHER_PATH, "/usr/bin/ext-bin", "--a", "b"], "argv＝launcher＋真命令＋参数（不落秘密）");
    assert.equal(ext["alwaysLoad"], true, "alwaysLoad 在位");
    assert.equal(ext["timeout"], 60_000, "工具级 timeout＝60s（外来 server 有界，不骑轮级时限）");
    const env = ext["env"] as Record<string, string>;
    assert.equal(env["TOK"], "base-locator-value", "env:NAME 引用按构造期 env 快照展开");
    assert.equal(env["LIT"], "literal", "字面量原样");
    assert.equal("MISS" in env, false, "引用缺失 ⇒ 该键省略（server 自报失败，不拦会话）");
    assert.equal(env["ANS_MCP_LAUNCHER_PASSTHROUGH"], JSON.stringify(["TOK", "LIT"]), "PASSTHROUGH 名单＝已解析键恰等（缺失键不在名单）");
    assert.equal(env["ELECTRON_RUN_AS_NODE"], undefined, "非 Electron 下不注入 ELECTRON_RUN_AS_NODE");
    assert.deepEqual(config.allowedTools, ["mcp__ans__probe", "mcp__ext"], "allowedTools 加 server 级名（1.x 白名单登记）");
    assert.equal(config.strictMcpConfig, true, "strictMcpConfig 未放松");
    assert.deepEqual(config.settingSources, [], "settingSources 仍为空（外部来源零搭车）");
    await session.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("H2 hook 放行五条件对抗：名错位/近似前缀/未绑定轮/非 dynamic/未安装名 ⇒ deny；合法 ⇒ allow 且**无 updatedInput**", async () => {
  const root = makeRoot();
  try {
    const engine = makeEngine();
    const session = await createClaudeRuntimeAdapter(
      options(root, [probeTool()], [{ name: "ext", command: "/bin/echo", args: [] }]),
      engine.dependencies,
    ).bindRole(role);
    const calls: Array<{ label: string; decision: string; updatedInput?: unknown; raw?: Record<string, unknown> }> = [];
    engine.setScript(async ({ opts, nativePromptId }) => {
      const hook = preHook(opts);
      const battery: Array<[string, Parameters<HookFn>[0], { signal?: AbortSignal }]> = [
        ["合法（installed+dynamic+绑定轮）", hookArgs({ prompt_id: nativePromptId, mcp_server: { name: "ext", source: "dynamic" } }), {}],
        ["名错位（server=ext 但 tool 名非它前缀）", hookArgs({ prompt_id: nativePromptId, tool_name: "mcp__ans__probe", mcp_server: { name: "ext", source: "dynamic" } }), {}],
        ["近似前缀（mcp__ext2__↛ext 白名单）", hookArgs({ prompt_id: nativePromptId, tool_name: "mcp__ext2__echo", mcp_server: { name: "ext", source: "dynamic" } }), {}],
        ["未安装 server 名（ext2 未注入）", hookArgs({ prompt_id: nativePromptId, tool_name: "mcp__ext2__echo", mcp_server: { name: "ext2", source: "dynamic" } }), {}],
        ["source=sdk ⇒ 拒", hookArgs({ prompt_id: nativePromptId, mcp_server: { name: "ext", source: "sdk" } }), {}],
        ["source=user ⇒ 拒", hookArgs({ prompt_id: nativePromptId, mcp_server: { name: "ext", source: "user" } }), {}],
        ["无 mcp_server ⇒ 拒", hookArgs({ prompt_id: nativePromptId }), {}],
        ["未绑定轮（未知 prompt_id）", hookArgs({ prompt_id: "unknown-native", mcp_server: { name: "ext", source: "dynamic" } }), {}],
        ["prompt_id 缺失", hookArgs({ mcp_server: { name: "ext", source: "dynamic" } }), {}],
        ["hookOptions.signal 已中止", hookArgs({ prompt_id: nativePromptId, mcp_server: { name: "ext", source: "dynamic" } }), { signal: AbortSignal.abort() }],
      ];
      for (const [label, args, extra] of battery) {
        const out = (await hook(args, "tu-x", { signal: extra.signal ?? new AbortController().signal })) as { hookSpecificOutput?: { permissionDecision?: string; updatedInput?: unknown } };
        calls.push({ label, decision: out.hookSpecificOutput?.permissionDecision ?? "none", updatedInput: out.hookSpecificOutput?.updatedInput, raw: out as unknown as Record<string, unknown> });
      }
      return [];
    });
    await session.prompt("battery");
    const decisions = new Map(calls.map((c) => [c.label, c]));
    assert.equal(decisions.get("合法（installed+dynamic+绑定轮）")!.decision, "allow", "合法 ⇒ allow");
    assert.equal("updatedInput" in (decisions.get("合法（installed+dynamic+绑定轮）")!.raw!["hookSpecificOutput"] as object), false, "放行分支不得注入 updatedInput（入参原样到达第三方 server）");
    for (const label of calls.map((c) => c.label).filter((l) => l !== "合法（installed+dynamic+绑定轮）")) {
      assert.equal(decisions.get(label)!.decision, "deny", `${label} ⇒ deny（实得 ${decisions.get(label)!.decision}）`);
    }
    await session.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("H3 审计两行配对：hook start 行（native-start）＋消息泵 tool_result 行（result）均以 mcp__ 名在场；非文本块标 unsupported", async () => {
  const root = makeRoot();
  try {
    const engine = makeEngine();
    const session = await createClaudeRuntimeAdapter(
      options(root, [probeTool()], [{ name: "ext", command: "/bin/echo", args: [] }]),
      engine.dependencies,
    ).bindRole(role);
    engine.setScript(async ({ opts, nativePromptId }) => {
      const hook = preHook(opts);
      await hook(hookArgs({ prompt_id: nativePromptId, mcp_server: { name: "ext", source: "dynamic" } }), "tu-wire", { signal: new AbortController().signal });
      const assistant = {
        type: "assistant",
        message: { id: "m1", type: "message", role: "assistant", model: "fixture", content: [{ type: "tool_use", id: "tu-wire", name: "mcp__ext__echo", input: { text: "MARKER-IN" } }], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
        parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
      };
      const result = {
        type: "user",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-wire", content: [{ type: "text", text: "RESULT-MARKER" }, { type: "image", source: {} }], is_error: false }] },
        parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
      };
      return [assistant, result];
    });
    const rows = await (async () => {
      const done = session.prompt("pair");
      await done;
      return collectUntilSettled(session);
    })();
    const start = rows.find((r) => r.kind === "tool_call" && String(r.summary).includes("mcp__ext__echo"));
    assert.ok(start, `hook start 行在场：${JSON.stringify(rows.map((r) => [r.kind, r.summary]))}`);
    const resultRow = rows.find((r) => (r.kind === "accepted" || r.kind === "denied") && String(r.summary).includes("RESULT-MARKER"));
    assert.ok(resultRow, "tool_result 配对出 result 行");
    assert.equal((resultRow!.detail as { toolName?: string }).toolName, "mcp__ext__echo", "result 行以同一 mcp__ 名归属（两行配对）");
    await session.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("H3b 生产投影路径：required-v1（projectToolEvent）下 MCP 两行事实含 native 内容与工具名（同 G-3 WebSearch 形）", async () => {
  const root = makeRoot();
  try {
    const engine = makeEngine();
    const display = createToolDisplayContext({ credentialEnvNames: [], requireProfile: true });
    const adapter = createClaudeRuntimeAdapter({
      ...options(root, [probeTool()], [{ name: "ext", command: "/bin/echo", args: [] }]),
      toolDisplayMode: "required-v1",
      projectToolEvent: display.projectToolEvent,
      registerToolDisplayProfile: display.registerToolDisplayProfile,
    }, engine.dependencies);
    const session = await adapter.bindRole(role);
    engine.setScript(async ({ opts, nativePromptId }) => {
      const hook = preHook(opts);
      await hook(hookArgs({ prompt_id: nativePromptId, mcp_server: { name: "ext", source: "dynamic" } }), "tu-proj", { signal: new AbortController().signal });
      const assistant = {
        type: "assistant",
        message: { id: "m1", type: "message", role: "assistant", model: "fixture", content: [{ type: "tool_use", id: "tu-proj", name: "mcp__ext__echo", input: { text: "IN" } }], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
        parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
      };
      const result = {
        type: "user",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-proj", content: [{ type: "text", text: "PROJ-RESULT" }, { type: "image", source: {} }], is_error: false }] },
        parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
      };
      return [assistant, result];
    });
    await session.prompt("projected");
    const rows = await collectUntilSettled(session);
    const blob = JSON.stringify(rows);
    assert.ok(blob.includes("mcp__ext__echo"), "投影行含工具名");
    assert.ok(blob.includes("PROJ-RESULT"), "结果文本经 native.content 到达投影（文本保真）");
    assert.ok(blob.includes("unsupported"), "非文本块如实标 unsupported（同 WebSearch 形）");
    assert.equal(rows.some((r) => r.kind === "message" && r.summary === "工具展示诊断"), false, "无 PROJECTION_FAILED 诊断");
    await session.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("H4 status 行：failed/needs-auth 类别化一行（无正文）；connected/未安装静默；每引擎一次；status 查询失败不毁轮", async () => {
  const root = makeRoot();
  try {
    const engine = makeEngine();
    engine.setStatus([
      { name: "ext", status: "failed", error: "ECONNREFUSED: connect failed at /very/long/internal/path (secret-detail)" },
      { name: "authy", status: "needs-auth", error: "" },
      { name: "ext2", status: "connected" },
      { name: "foreign", status: "failed", error: "SHOULD-NOT-SURFACE" },
    ]);
    const session = await createClaudeRuntimeAdapter(
      options(root, [probeTool()], [
        { name: "ext", command: "/bin/echo", args: [] },
        { name: "authy", command: "/bin/echo", args: [] },
        { name: "ext2", command: "/bin/echo", args: [] },
      ]),
      engine.dependencies,
    ).bindRole(role);
    const collect = async (): Promise<SessionEvent[]> => {
      engine.setScript(async () => []);
      const done = session.prompt("s");
      await done;
      return collectUntilSettled(session);
    };
    const rows1 = await collect();
    const statusLines = rows1.filter((r) => r.kind === "message" && String(r.summary).startsWith("已安装 MCP「"));
    assert.deepEqual(
      statusLines.map((r) => r.summary).sort(),
      ["已安装 MCP「authy」未连接：needs-auth", "已安装 MCP「ext」未连接：ECONNREFUSED"],
      "恰两条类别化行（connected/未安装名静默；类别取首 CODE token）",
    );
    assert.ok(!statusLines.some((r) => String(r.summary).includes("secret-detail")), "错误正文不落行（类别化，不带全文）");
    assert.equal(engine.statusCalls, 1, "status 每引擎恰一次");
    const rows2 = await collect();
    assert.equal(rows2.filter((r) => String(r.summary).startsWith("已安装 MCP「")).length, 0, "次轮不重复报 status");
    assert.equal(engine.statusCalls, 1, "次轮不再咨询 status");
    // status 查询失败：轮次照完（不毁会话）
    const engine2 = makeEngine();
    engine2.setStatusThrows(true);
    const session2 = await createClaudeRuntimeAdapter(options(root, [probeTool()], [{ name: "ext", command: "/bin/echo", args: [] }]), engine2.dependencies).bindRole(role);
    engine2.setScript(async () => []);
    await session2.prompt("status-fails");
    const rows3 = await collectUntilSettled(session2);
    assert.ok(rows3.some((r) => r.kind === "settled"), "status 查询失败 ⇒ 会话轮次照完");
    assert.equal(rows3.some((r) => String(r.summary).startsWith("已安装 MCP「")), false, "查询失败不产生伪状态行");
    await session.dispose();
    await session2.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("H5 零安装零变化：未注入 installedMcpServers ⇒ allowedTools/mcpServers/放行面与旧行为一致（无 mcp__ 外来前缀行）", async () => {
  const root = makeRoot();
  try {
    const engine = makeEngine();
    const session = await createClaudeRuntimeAdapter(options(root, [probeTool()]), engine.dependencies).bindRole(role);
    engine.setScript(async ({ opts, nativePromptId }) => {
      const hook = preHook(opts);
      const out = (await hook(hookArgs({ prompt_id: nativePromptId, tool_name: "mcp__ext__echo", mcp_server: { name: "ext", source: "dynamic" } }), "tu", { signal: new AbortController().signal })) as { hookSpecificOutput?: { permissionDecision?: string } };
      assert.equal(out.hookSpecificOutput?.permissionDecision, "deny", "零安装 ⇒ 外来面全拒（封死未放松）");
      return [];
    });
    await session.prompt("no-install");
    const config = engine.configurations[0]!;
    assert.deepEqual(config.allowedTools, ["mcp__ans__probe"], "allowedTools 逐字旧形");
    assert.deepEqual(Object.keys(config.mcpServers as object), ["ans"], "mcpServers 仅 ans");
    await session.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
