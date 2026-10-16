// G-3 独立验证（测试角色）：Claude 适配器——能力位隔离、PreToolUse 放行分支对抗、消息泵配对与归一。
// **不复用实施方断言**：自建 fake query（仅 transporte 面替身；MCP 注册/工具 schema 走真实 SDK 实现），
// 全部场景、帧素材与断言本文件独立构造（对照批准口径 ①②③④ 与实施记录三处落点）。
//
// 运行：node --test "test/测试/g3-search-verify/claude-websearch-verify.test.ts"（零网络）。
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage, SDKUserMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import * as z from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClaudeRuntimeAdapter } from "../../../src/provider/claude/session.ts";
import { createToolDisplayContext } from "../../../src/common/runtime-core/tool-display.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";
import type { RuntimeProviderOptions, InteractionGate, ToolDefinition, SessionEvent } from "../../../src/model/runtime.ts";

const QUERY = "独立验证查询-CLAUDE-7";
const role: ResolvedRole = {
  id: "g3-verify-claude", kind: "project", cardText: "# G-3 Claude 验证",
  boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
  boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" },
};
const gate = (): InteractionGate => ({ begin() {}, end() {}, isWaiting: () => false, onChange: () => () => {} });

const baseEnv = { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: "g3-verify-fake-key" };
const webEnv = (value: string | undefined) => ({ ...baseEnv, ...(value === undefined ? {} : { ANS_CLAUDE_WEB_SEARCH: value }) });

/** 每轮由脚本驱动的 fake query：驱动真实 MCP server/hook 链，只在事件产出上替身。 */
function fake(script: (context: { options: Options; user: SDKUserMessage; queryIndex: number; userIndex: number; callHook: (input: Record<string, unknown>, hookSignal?: AbortSignal) => Promise<unknown>; callAnsTool: (name: string, args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text?: string }> }>; userPromptId: () => string | undefined }) => Promise<{ frames?: SDKMessage[]; fail?: boolean } | void>) {
  const configurations: Options[] = [];
  const query = ({ prompt, options }: { prompt: AsyncIterable<SDKUserMessage>; options?: Options }) => {
    const opts = options!;
    const queryIndex = configurations.push(opts) - 1;
    const client = new Client({ name: "g3-verify", version: "1.0.0" });
    const server = opts.mcpServers!.ans;
    assert.equal(server.type, "sdk");
    let nativePromptId: string | undefined;
    let closed = false;
    let userIndex = -1;
    const generator = (async function* () {
      if (server.type !== "sdk") throw new Error("wrong config");
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.instance.connect(serverTransport);
      await client.connect(clientTransport);
      for await (const user of prompt as AsyncIterable<SDKUserMessage>) {
        if (closed) return;
        userIndex += 1;
        nativePromptId = user.uuid;
        const content = user.message.content;
        const promptText = typeof content === "string" ? content : content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join("\n");
        await opts.hooks!.UserPromptSubmit![0]!.hooks[0]!({ hook_event_name: "UserPromptSubmit", prompt_id: nativePromptId, prompt: promptText, session_id: "fixture", transcript_path: "fixture", cwd: opts.cwd! }, undefined, { signal: opts.abortController!.signal });
        const callHook = async (input: Record<string, unknown>, hookSignal?: AbortSignal) => {
          const hook = opts.hooks!.PreToolUse![0]!.hooks[0]!;
          return hook({ session_id: "fixture", transcript_path: "fixture", cwd: opts.cwd!, tool_use_id: "hook-call", ...input } as never, undefined, { signal: hookSignal ?? opts.abortController!.signal });
        };
        const callAnsTool = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }, undefined, { requestOptions: { timeout: server.timeout } } as never) as Promise<{ isError?: boolean; content: Array<{ text?: string }> }>;
        const result = await script({ options: opts, user, queryIndex, userIndex, callHook, callAnsTool, userPromptId: () => nativePromptId });
        if (closed) return;
        for (const frame of result?.frames ?? []) yield frame;
        yield { type: "result", subtype: result?.fail ? "error_during_execution" : "success", is_error: !!result?.fail, session_id: "fixture-native", user_message_uuid: user.uuid } as unknown as SDKMessage;
      }
    })();
    return Object.assign(generator, {
      async interrupt() {},
      close() { closed = true; void client.close().catch(() => {}); },
    }) as unknown as Query;
  };
  return { configurations, dependencies: { loadSdk: async () => ({ createSdkMcpServer, query }), loadZod: async () => z } };
}

const options = (root: string, tools: readonly ToolDefinition[], extra: Partial<RuntimeProviderOptions> = {}): RuntimeProviderOptions => ({ runtime: "claude", projectRoot: root, skillRoot: root, tools, interactionGate: gate(), currentTurnId: () => undefined, promptTimeoutMs: 2000, ...extra });
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "ans-g3-claude-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function collect(session: { events(): AsyncIterable<SessionEvent> }, settledCount: number): Promise<SessionEvent[]> {
  const output: SessionEvent[] = [];
  for await (const event of session.events()) { output.push(event); if (output.filter((row) => row.kind === "settled").length === settledCount) return output; }
  return output;
}
const assistantFrame = (blocks: unknown[]): SDKMessage => ({
  type: "assistant",
  message: { id: "msg_g3", type: "message", role: "assistant", model: "fixture", content: blocks, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  parent_tool_use_id: null, session_id: "fixture-native", uuid: randomUUID(),
}) as unknown as SDKMessage;
const toolResultFrame = (toolUseId: string, content: unknown, isError: boolean): SDKMessage => ({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content, is_error: isError }] },
  parent_tool_use_id: null, session_id: "fixture-native", uuid: randomUUID(),
}) as unknown as SDKMessage;
const webSearchBlock = (id: string, query: string) => ({ type: "tool_use", id, name: "WebSearch", input: { query } });
const probeTool = (): ToolDefinition => ({ name: "probe", description: "fixture", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "probe 已执行" }) });

// —————————————————————— ① 能力位隔离（默认关/显式关/非法值）——————————————————————

test("隔离：ANS_CLAUDE_WEB_SEARCH 未设/0/off/非法值 ⇒ tools=[]、allowedTools 无 WebSearch、绑定轮 WebSearch 仍 deny、帧零消费", async () => {
  for (const value of [undefined, "0", "off", "garbage", "true", "yes"]) {
    await fixture(async (root) => {
      const engine = fake(async ({ options: config, callHook }) => {
        assert.deepEqual(config.tools, [], `[${String(value)}] tools 必须为空`);
        assert.equal(config.allowedTools!.includes("WebSearch"), false, `[${String(value)}] allowedTools 不得含 WebSearch`);
        // 绑定活动轮 + 无 mcp_server 的 WebSearch —— 关位下必须仍 deny（能力缺席=最强 fail-closed）
        const hookResult = await callHook({ hook_event_name: "PreToolUse", prompt_id: undefined, tool_name: "WebSearch", tool_input: { query: QUERY } }, undefined);
        assert.equal((hookResult as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny", `[${String(value)}]`);
        return { frames: [assistantFrame([{ type: "text", text: "普通答复。" }, webSearchBlock("tu_off", QUERY)]), toolResultFrame("tu_off", "不应消费", false)] };
      });
      const adapter = createClaudeRuntimeAdapter(options(root, [probeTool()]), { env: webEnv(value), ...engine.dependencies } as never);
      await adapter.composeContext(role);
      const session = await adapter.bindRole(role);
      await session.prompt("隔离轮");
      const events = await collect(session, 1);
      assert.equal(events.filter((event) => event.kind === "tool_call" || event.kind === "accepted" || event.kind === "denied").length, 0, `[${String(value)}] 关位零工具事件`);
      assert.ok(events.some((event) => event.kind === "message" && event.summary === "普通答复。"), "文本流逐字保留");
      await session.dispose();
    });
  }
});

test("开启面：1/on（含大小写与空白变体）⇒ tools=[WebSearch] 且 allowedTools 追加 WebSearch；canUseTool 兜底仍 deny", async () => {
  for (const value of ["1", "on", " ON ", "On"]) {
    await fixture(async (root) => {
      const engine = fake(async ({ options: config }) => {
        assert.deepEqual(config.tools, ["WebSearch"], `[${value}]`);
        assert.equal(config.allowedTools!.includes("WebSearch"), true, `[${value}]`);
        const verdict = await config.canUseTool!("WebSearch", { query: QUERY }, { signal: new AbortController().signal, toolUseID: "x", requestId: "x" } as never);
        assert.equal(verdict?.behavior, "deny", "canUseTool 兜底不得被 WebSearch 开后门");
        return {};
      });
      const adapter = createClaudeRuntimeAdapter(options(root, [probeTool()]), { env: webEnv(value), ...engine.dependencies } as never);
      await adapter.composeContext(role);
      const session = await adapter.bindRole(role);
      await session.prompt("开启面");
      await collect(session, 1);
      await session.dispose();
    });
  }
});

// —————————————————————— ② PreToolUse 放行分支对抗 ——————————————————————

test("放行分支对抗：恰 allow 且**无 updatedInput**（原文 query 不改写）；伪造名/mcp_server/未绑定/跨轮延后/中止信号必须仍 deny", async () => {
  await fixture(async (root) => {
    let firstPromptId: string | undefined;
    const engine = fake(async ({ callHook, userPromptId, userIndex }) => {
      if (userIndex === 0) {
        firstPromptId = userPromptId();
        // 正例：绑定活动轮 + WebSearch + 无 mcp_server ⇒ 恰 {hookEventName, permissionDecision:"allow"}（无别的键）
        const allowed = await callHook({ hook_event_name: "PreToolUse", prompt_id: firstPromptId, tool_name: "WebSearch", tool_input: { query: QUERY }, tool_use_id: "tu_allow" });
        assert.deepEqual(allowed, { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } });
        // 伪造/边界名
        for (const name of ["websearch", "WebSearchx", "Bash", "mcp__ans__probe"]) {
          const verdict = await callHook({ hook_event_name: "PreToolUse", prompt_id: firstPromptId, tool_name: name, tool_input: {}, tool_use_id: "tu_x" });
          assert.equal((verdict as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny", `名=${name}`);
        }
        // 带 mcp_server（任一来源）⇒ deny（WebSearch 只能是无源的客户端内置）
        const withServer = await callHook({ hook_event_name: "PreToolUse", prompt_id: firstPromptId, tool_name: "WebSearch", tool_input: {}, tool_use_id: "tu_mcp", mcp_server: { name: "ans", source: "sdk" } });
        assert.equal((withServer as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
        // 未绑定 prompt_id ⇒ deny（含 unattributed 诊断事件）
        const unbound = await callHook({ hook_event_name: "PreToolUse", prompt_id: "foreign-prompt", tool_name: "WebSearch", tool_input: {}, tool_use_id: "tu_u" });
        assert.equal((unbound as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
        // 已中止 hook 信号 ⇒ deny
        const aborted = new AbortController(); aborted.abort();
        const abortedVerdict = await callHook({ hook_event_name: "PreToolUse", prompt_id: firstPromptId, tool_name: "WebSearch", tool_input: {}, tool_use_id: "tu_a" }, aborted.signal);
        assert.equal((abortedVerdict as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny");
        return {};
      }
      // 第 2 轮：上一轮 prompt_id 的 WebSearch（跨轮延后）⇒ 必须仍 deny（originalTurn !== active）
      const delayed = await callHook({ hook_event_name: "PreToolUse", prompt_id: firstPromptId, tool_name: "WebSearch", tool_input: {}, tool_use_id: "tu_old" });
      assert.equal((delayed as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, "deny", "旧轮身份延后不得放行");
      const fresh = await callHook({ hook_event_name: "PreToolUse", prompt_id: userPromptId(), tool_name: "WebSearch", tool_input: {}, tool_use_id: "tu_new" });
      assert.deepEqual(fresh, { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }, "新轮绑定仍正常放行");
      return {};
    });
    const adapter = createClaudeRuntimeAdapter(options(root, [probeTool()]), { env: webEnv("on"), ...engine.dependencies } as never);
    await adapter.composeContext(role);
    const session = await adapter.bindRole(role);
    await session.prompt("第一轮");
    await session.prompt("第二轮");
    const events = await collect(session, 2);
    assert.ok(events.some((event) => event.kind === "message" && (event.detail as { code?: string } | undefined)?.code === "CALL_CONTEXT_UNATTRIBUTED"), "未绑定必须留下 unattributed 诊断");
    await session.dispose();
  });
});

test("ANS 工具分支不回退：WebSearch 开启时合法 mcp__ans__ 工具仍得 updatedInput 请求上下文令牌并真实执行", async () => {
  await fixture(async (root) => {
    const engine = fake(async ({ callHook, callAnsTool, userPromptId }) => {
      const updated = await callHook({ hook_event_name: "PreToolUse", prompt_id: userPromptId(), tool_name: "mcp__ans__probe", tool_input: { note: "n" }, tool_use_id: "tu_ans", mcp_server: { name: "ans", source: "sdk" } }) as { hookSpecificOutput: { permissionDecision: string; updatedInput: Record<string, unknown> } };
      assert.equal(updated.hookSpecificOutput.permissionDecision, "allow");
      assert.equal(typeof updated.hookSpecificOutput.updatedInput.__ans_call_context, "string");
      const result = await callAnsTool("probe", updated.hookSpecificOutput.updatedInput);
      assert.equal(result.isError !== true, true, "ANS 工具真实执行成功");
      return {};
    });
    const adapter = createClaudeRuntimeAdapter(options(root, [probeTool()]), { env: webEnv("on"), ...engine.dependencies } as never);
    await adapter.composeContext(role);
    const session = await adapter.bindRole(role);
    await session.prompt("ANS 分支");
    const events = await collect(session, 1);
    assert.equal(events.filter((event) => event.kind === "settled").length, 1);
    await session.dispose();
  });
});

// —————————————————————— ③ 消息泵：配对/归一/400 不毁轮次 ——————————————————————

test("消息泵映射：native-start/result 恰对、toolCallId 关联、四类 content 归一（text/unsupported 省略标注/字符串）；非 WebSearch 与未跟踪 id 零消费", async () => {
  await fixture(async (root) => {
    const engine = fake(async ({ userIndex }) => {
      if (userIndex === 0) {
        return { frames: [
          assistantFrame([
            { type: "text", text: "正在检索。" },
            webSearchBlock("tu_W1", QUERY),
            { type: "tool_use", id: "tu_bash", name: "Bash", input: { command: "ls" } },
          ]),
          toolResultFrame("tu_bash", "bash 输出不应消费", false),
          toolResultFrame("tu_unknown", "未跟踪 id 不应消费", false),
          toolResultFrame("tu_W1", [{ type: "text", text: "Web search results for query: " + QUERY + " 独立结果正文。" }, { type: "image", source: { data: "x" } }], false),
        ] };
      }
      return { frames: [
        assistantFrame([webSearchBlock("tu_W2", QUERY + "-2")]),
        toolResultFrame("tu_W2", "API Error: 400 invalid_request_error", true),
      ] };
    });
    const projector = createToolDisplayContext();
    const adapter = createClaudeRuntimeAdapter(options(root, [probeTool()], { projectToolEvent: projector.projectToolEvent }), { env: webEnv("1"), ...engine.dependencies } as never);
    await adapter.composeContext(role);
    const session = await adapter.bindRole(role);
    await session.prompt("第一轮");
    await session.prompt("第二轮");
    const events = await collect(session, 2);

    const toolEvents = events.filter((event) => event.kind === "tool_call" || event.kind === "accepted" || event.kind === "denied");
    assert.equal(toolEvents.length, 4, "两轮各恰一对（start/result），Bash/未跟踪零消费");
    const pairs = new Map<string, SessionEvent[]>();
    for (const event of toolEvents) {
      const id = String((event.detail as Record<string, unknown>)["toolCallId"]);
      pairs.set(id, [...(pairs.get(id) ?? []), event]);
    }
    assert.deepEqual([...pairs.keys()].map((key) => key.replace(/^[^:]+:/, "")).sort(), ["tu_W1", "tu_W2"]);
    for (const [id, pair] of pairs) {
      assert.equal(pair.length, 2, `${id} 恰一对`);
      assert.equal(pair[0]!.kind, "tool_call");
      const startDetail = pair[0]!.detail as Record<string, unknown>;
      assert.equal(startDetail["toolName"], "WebSearch");
      assert.equal(startDetail["phase"], "start");
      assert.notEqual(pair[1]!.kind, "tool_call");
      assert.equal(String((pair[1]!.detail as Record<string, unknown>)["toolCallId"]), id, "结果与发起同 id");
      assert.equal(pair[0]!.turnId, pair[1]!.turnId, "同一次调用的两相位同轮（id 关联）");
    }
    const w1Key = [...pairs.keys()].find((key) => key.endsWith(":tu_W1"))!;
    const w2Key = [...pairs.keys()].find((key) => key.endsWith(":tu_W2"))!;
    assert.notEqual(pairs.get(w1Key)![0]!.turnId, pairs.get(w2Key)![0]!.turnId, "两轮的配对各自归属（跨轮不串）");
    const okPair = pairs.get([...pairs.keys()].find((key) => key.endsWith(":tu_W1"))!)!;
    const okResult = okPair[1]!.detail as Record<string, unknown>;
    assert.equal(okPair[1]!.kind, "accepted");
    assert.equal(okResult["ok"], true);
    const okDisplay = okResult["display"] as { resultText: { text: string }; omissions: string[] };
    assert.ok(okDisplay.resultText.text.includes("Web search results for query: " + QUERY), "结果正文如实进结果行");
    assert.ok(okDisplay.omissions.includes("unsupported-content"), "非文本 content 以 unsupported-content 省略标注（不编造）");
    assert.equal(String(okDisplay.resultText.text).includes("Bash"), false);

    const errPair = pairs.get([...pairs.keys()].find((key) => key.endsWith(":tu_W2"))!)!;
    assert.equal(errPair[1]!.kind, "denied", "is_error ⇒ denied 如实");
    const errDetail = errPair[1]!.detail as Record<string, unknown>;
    assert.equal(errDetail["ok"], false);
    assert.ok(((errDetail["display"] as { error?: { text: string } }).error?.text ?? "").includes("API Error: 400"), "错误文本如实（400 侧查询不掩蔽）");

    // settled 两轮均 completed（400 的 is_error 不毁轮次）
    const settled = events.filter((event) => event.kind === "settled");
    assert.deepEqual(settled.map((event) => (event.detail as { outcome: string }).outcome), ["completed", "completed"]);
    // ③ 查询串不进 message 行（会话内只在工具事实/结果文本）；且文本行逐字保留
    assert.equal(events.some((event) => event.kind === "message" && String(event.summary).includes(QUERY)), false, "assistant 文本行不得出现查询串");
    assert.ok(events.some((event) => event.kind === "message" && event.summary === "正在检索。"));
    await session.dispose();
  });
});

test("跨轮未配对收尾：首轮 tool_use 无结果帧 ⇒ 只有 start；次轮迟到的旧 id tool_result 不再消费、不串行", async () => {
  await fixture(async (root) => {
    const engine = fake(async ({ userIndex }) => {
      if (userIndex === 0) return { frames: [assistantFrame([webSearchBlock("tu_late", QUERY)])] };
      return { frames: [toolResultFrame("tu_late", "迟到结果", false)] };
    });
    const adapter = createClaudeRuntimeAdapter(options(root, [probeTool()]), { env: webEnv("on"), ...engine.dependencies } as never);
    await adapter.composeContext(role);
    const session = await adapter.bindRole(role);
    await session.prompt("第一轮");
    await session.prompt("第二轮");
    const events = await collect(session, 2);
    const toolEvents = events.filter((event) => event.kind === "tool_call" || event.kind === "accepted" || event.kind === "denied");
    assert.equal(toolEvents.length, 1, "迟到结果不得跨界补配对");
    assert.equal(toolEvents[0]!.kind, "tool_call");
    assert.equal(String((toolEvents[0]!.detail as Record<string, unknown>)["toolCallId"]).endsWith(":tu_late"), true);
    await session.dispose();
  });
});
