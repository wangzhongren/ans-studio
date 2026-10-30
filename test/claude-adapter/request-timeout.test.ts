// test/claude-adapter/request-timeout.test.ts
// P1（2026-10-30 团队计划 §4.3 / §5.2；附录 B）：**Claude 适配器请求级超时 + SDK api_retry 诊断**——
//  - 首字节永不来 ⇒ 注入小值（40ms）判超时：prompt 拒绝 code=`request-timeout-first-byte`，
//    settled outcome=failed（**不是**最后兜底 timed_out），恰一条 settled；
//  - 流中途静默 ⇒ `request-timeout-idle`；持续有流活动（长回合）不被误杀；
//  - 交互等待 / 工具执行期间计时停走（不超时）；abort 取消后不再触发超时；
//  - SDK `system/api_retry` ⇒ 诊断 request.sdk-retry（attempt/max/delay/status/no_response）+ 角色日志一行；
//    SDK 重试期间 ANS **不**发第二次请求（users 恰 1 条）。
// 真实路径：真实 createClaudeRuntimeAdapter（只以假 SDK 传输替代 query；MCP 走真实 InMemoryTransport 注册路径），
// 诊断经真实 createDiagnosticLogger（临时目录）核对；不 helper 自证。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage, SDKUserMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import * as z from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { RuntimeProviderOptions, InteractionGate, ToolDefinition, SessionEvent } from "../../src/model/runtime.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

const role: ResolvedRole = { id: "claude-request-timeout", kind: "project", cardText: "# fixture", boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
const environment = { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: "fixture-api-secret" };
const assistantFrame = (blocks: unknown[]): SDKMessage => ({
  type: "assistant",
  message: { id: "msg_fixture", type: "message", role: "assistant", model: "fixture", content: blocks, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
}) as unknown as SDKMessage;
const apiRetryFrame = (fields: { attempt: number; max_retries: number; retry_delay_ms: number; error_status: number | null; no_response?: { waited_ms: number; retry_wait_ms: number } }): SDKMessage => ({
  type: "system", subtype: "api_retry", error: "server_error", uuid: randomUUID(), session_id: "fixture", ...fields,
}) as unknown as SDKMessage;

/** 假 SDK 传输：真实 MCP 注册/PreToolUse/工具 handler；只有 query 是假的（与 session.test.ts 同口径）。 */
type ScriptContext = { client: Client; options: Options; user: SDKUserMessage };
type Script = (ctx: ScriptContext) => AsyncGenerator<SDKMessage, void, unknown>;

function fake(script: Script) {
  const configurations: Options[] = [];
  const users: SDKUserMessage[] = [];
  const query = ({ prompt, options }: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => {
    assert.equal(typeof prompt, "object");
    const opts = options!;
    configurations.push(opts);
    const client = new Client({ name: "request-timeout-fixture", version: "1.0.0" });
    const server = opts.mcpServers!.ans;
    assert.equal(server.type, "sdk");
    const actualCallTool = client.callTool.bind(client);
    let nativePromptId: string | undefined;
    client.callTool = async (params, resultSchema, requestOptions) => {
      const toolUseId = randomUUID();
      const hook = opts.hooks!.PreToolUse![0]!.hooks[0]!;
      const result = await hook({ hook_event_name: "PreToolUse", prompt_id: nativePromptId, tool_name: `mcp__ans__${params.name}`, tool_input: params.arguments ?? {}, tool_use_id: toolUseId, session_id: "fixture", transcript_path: "fixture", cwd: opts.cwd!, mcp_server: { name: "ans", source: "sdk" } }, toolUseId, { signal: requestOptions?.signal ?? opts.abortController!.signal });
      const output = result as { hookSpecificOutput?: { permissionDecision?: string; updatedInput?: Record<string, unknown> } };
      if (output.hookSpecificOutput?.permissionDecision === "deny") return { content: [{ type: "text", text: "fixture hook denied" }], isError: true };
      return actualCallTool({ ...params, arguments: output.hookSpecificOutput?.updatedInput ?? params.arguments }, resultSchema, { ...requestOptions, timeout: server.timeout });
    };
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const connected = (async () => {
      await server.instance.connect(serverTransport);
      await client.connect(clientTransport);
    })();
    const nativeId = opts.resume ?? randomUUID();
    let closed = false;
    const generator = (async function* () {
      await connected;
      for await (const user of prompt as AsyncIterable<SDKUserMessage>) {
        users.push(user);
        nativePromptId = user.uuid;
        const promptText = typeof user.message.content === "string" ? user.message.content : user.message.content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join("\n");
        await opts.hooks!.UserPromptSubmit![0]!.hooks[0]!({ hook_event_name: "UserPromptSubmit", prompt_id: nativePromptId, prompt: promptText, session_id: "fixture", transcript_path: "fixture", cwd: opts.cwd! }, undefined, { signal: opts.abortController!.signal });
        if (closed) break;
        const sequence = script({ client, options: opts, user });
        for await (const frame of sequence) {
          if (closed) break;
          yield frame;
        }
        if (closed) break;
        yield { type: "result", subtype: "success", is_error: false, session_id: nativeId, user_message_uuid: user.uuid } as SDKMessage;
      }
    })();
    return Object.assign(generator, {
      async interrupt() {},
      close() { closed = true; void connected.then(() => client.close()).catch(() => {}); },
      async mcpServerStatus() { return []; },
    }) as unknown as Query;
  };
  return {
    configurations,
    users,
    dependencies: { env: environment, loadSdk: async () => ({ createSdkMcpServer, query }), loadZod: async () => z },
  };
}

/** 永不返回（首字节/流空闲挂起）；request abort 时以 AbortError 退出，避免测试留下悬挂生产者。 */
function hang(options: Options): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const signal = options.abortController!.signal;
    const fail = () => reject(Object.assign(new Error("fixture abort"), { name: "AbortError" }));
    if (signal.aborted) return fail();
    signal.addEventListener("abort", fail, { once: true });
  });
}

function gate(): InteractionGate {
  let waiting = 0;
  const listeners = new Set<(waiting: boolean) => void>();
  const emit = () => { for (const listener of listeners) listener(waiting > 0); };
  return { begin() { waiting += 1; emit(); }, end() { waiting -= 1; emit(); }, isWaiting: () => waiting > 0, onChange(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}

const probeTool = (sleepMs: number): ToolDefinition => ({
  name: "probe", description: "fixture", inputSchema: { type: "object", properties: {} },
  handler: async () => { await delay(sleepMs); return { ok: true, message: "probe done" }; },
});

const options = (root: string, tools: readonly ToolDefinition[], overrides: Partial<RuntimeProviderOptions> = {}): RuntimeProviderOptions => ({
  runtime: "claude", projectRoot: root, skillRoot: root, tools, interactionGate: gate(), currentTurnId: () => undefined,
  requestFirstByteTimeoutMs: 50, requestIdleTimeoutMs: 50, ...overrides,
});

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ans-claude-request-timeout-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function collect(session: { events(): AsyncIterable<SessionEvent> }, until = 1): Promise<SessionEvent[]> {
  const output: SessionEvent[] = [];
  for await (const event of session.events()) {
    output.push(event);
    if (output.filter((row) => row.kind === "settled").length >= until) return output;
  }
  return output;
}

async function withDiagnostics<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "ans-request-timeout-diag-"));
  configureDiagnostics({ directory: dir });
  try { return await fn(dir); } finally { await disposeDiagnostics(); await rm(dir, { recursive: true, force: true }); }
}

interface DiagRecord { event: string; [key: string]: unknown }

async function diagnosticEvents(dir: string): Promise<DiagRecord[]> {
  await flushDiagnostics();
  const records: DiagRecord[] = [];
  for (const file of await readdir(dir)) {
    const text = await readFile(join(dir, file), "utf8");
    for (const line of text.trim().split("\n")) if (line !== "") records.push(JSON.parse(line) as DiagRecord);
  }
  return records;
}

test("首字节永不来：注入 40ms ⇒ prompt 拒绝 request-timeout-first-byte；恰一条 settled(failed)；诊断齐全", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      const engine = fake(async function* ({ options: config }) { await hang(config); });
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestFirstByteTimeoutMs: 40, requestIdleTimeoutMs: 10_000 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      const failure = await session.prompt("首字节测试").then(() => undefined, (error: unknown) => error as Error & { code?: string });
      assert.ok(failure, "首字节超时必须失败，不得伪造成功");
      assert.equal(failure!.name, "RequestTimeoutError");
      assert.equal(failure!.code, "request-timeout-first-byte");
      const events = await eventsPromise;
      const terminals = events.filter((event) => event.kind === "settled");
      assert.equal(terminals.length, 1, "超时终态恰一条 settled（不产生额外 settled）");
      assert.equal((terminals[0]!.detail as { outcome?: unknown }).outcome, "failed", "请求超时是 failed（不是最后兜底 timed_out）");
      assert.equal(engine.users.length, 1, "ANS 只发一次请求输入，不并发重试（P1 无 ANS 重试）");
      const records = await diagnosticEvents(dir);
      const timeout = records.find((record) => record.event === "request.timeout");
      assert.ok(timeout, "必须写 request.timeout 诊断");
      assert.equal(timeout!.turnId, terminals[0]!.turnId);
      assert.equal(timeout!.mode, "first-byte");
      assert.equal(timeout!.timeoutMs, 40);
      assert.equal(timeout!.replayPlan, "safe");
      assert.ok(typeof timeout!.durationMs === "number");
      const start = records.find((record) => record.event === "request.attempt.start");
      assert.ok(start, "必须写 request.attempt.start 诊断");
      assert.equal(start!.attempt, 1);
      assert.equal(start!.timeoutMs, 40);
      assert.equal(start!.durationMs, 10_000, "idle 时限经既有白名单数值字段承载（未改 diagnostics 白名单）");
      const failed = records.find((record) => record.event === "request.failed");
      assert.ok(failed, "必须写 request.failed 诊断");
      assert.equal(failed!.errorCode, "request-timeout-first-byte");
      await session.dispose();
    });
  });
});

test("流中途静默：首条消息后 40ms 无活动 ⇒ request-timeout-idle；诊断含 mode=idle", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      const engine = fake(async function* ({ options: config }) {
        yield assistantFrame([{ type: "text", text: "先输出一段" }]);
        await hang(config);
      });
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestFirstByteTimeoutMs: 500, requestIdleTimeoutMs: 40 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      const failure = await session.prompt("空闲测试").then(() => undefined, (error: unknown) => error as Error & { code?: string });
      assert.equal(failure?.code, "request-timeout-idle");
      const events = await eventsPromise;
      assert.equal(events.filter((event) => event.kind === "settled").length, 1);
      assert.equal((events.find((event) => event.kind === "settled")!.detail as { outcome?: unknown }).outcome, "failed");
      const records = await diagnosticEvents(dir);
      const timeout = records.find((record) => record.event === "request.timeout");
      assert.equal(timeout?.mode, "idle");
      assert.equal(timeout?.timeoutMs, 40);
      assert.ok(records.some((record) => record.event === "request.first-byte" && record.durationMs !== undefined), "首字节到达应写诊断");
      await session.dispose();
    });
  });
});

test("持续活动（长回合）：每 15ms 一条消息、idle 40ms ⇒ 不误杀，正常 completed", async () => {
  await fixture(async (root) => {
    const engine = fake(async function* () {
      for (let index = 0; index < 5; index += 1) {
        await delay(15);
        yield assistantFrame([{ type: "text", text: `段 ${index}` }]);
      }
      yield assistantFrame([{ type: "text", text: "完成" }]);
    });
    const session = await createClaudeRuntimeAdapter(options(root, [], { requestFirstByteTimeoutMs: 200, requestIdleTimeoutMs: 40 }), engine.dependencies).bindRole(role);
    const eventsPromise = collect(session);
    await session.prompt("长回合测试");
    const events = await eventsPromise;
    const terminal = events.find((event) => event.kind === "settled")!;
    assert.equal((terminal.detail as { outcome?: unknown }).outcome, "completed", "持续有流活动不得被请求超时误杀");
    await session.dispose();
  });
});

test("交互等待期间计时停走：gate.begin 期间跨过 40ms 不超时；gate.end 后按剩余时间继续", async () => {
  await fixture(async (root) => {
    const engine = fake(async function* ({ options: config }) { await hang(config); });
    const interactionGate = gate();
    interactionGate.begin();
    const session = await createClaudeRuntimeAdapter(options(root, [], { requestFirstByteTimeoutMs: 40, requestIdleTimeoutMs: 10_000, interactionGate }), engine.dependencies).bindRole(role);
    let outcome: { error?: Error & { code?: string }; pending: boolean } = { pending: true };
    void session.prompt("交互暂停测试").then(() => { outcome = { pending: false }; }, (error: Error & { code?: string }) => { outcome = { pending: false, error }; });
    await delay(120);
    assert.equal(outcome.pending, true, "交互等待期间请求超时计时停走（120ms > 40ms 也不得超时）");
    interactionGate.end();
    for (let index = 0; index < 100 && outcome.pending; index += 1) await delay(5);
    assert.equal(outcome.pending, false, "恢复后按剩余时间继续，最终仍超时");
    assert.equal(outcome.error?.code, "request-timeout-first-byte");
    await session.dispose();
  });
});

test("工具执行期间计时停走：handler 睡 120ms、idle 40ms ⇒ 不超时，回合正常完成", async () => {
  await fixture(async (root) => {
    const engine = fake(async function* ({ client }) {
      yield assistantFrame([{ type: "tool_use", id: "tu-1", name: "mcp__ans__probe", input: {} }]);
      const result = await client.callTool({ name: "probe", arguments: {} });
      assert.ok(!(result as { isError?: boolean }).isError, "probe 工具应成功（真实 MCP 注册路径）");
      yield assistantFrame([{ type: "text", text: "工具后继续" }]);
    });
    const session = await createClaudeRuntimeAdapter(options(root, [probeTool(120)], { requestFirstByteTimeoutMs: 200, requestIdleTimeoutMs: 40 }), engine.dependencies).bindRole(role);
    const eventsPromise = collect(session);
    await session.prompt("工具暂停测试");
    const terminal = (await eventsPromise).find((event) => event.kind === "settled")!;
    assert.equal((terminal.detail as { outcome?: unknown }).outcome, "completed", "工具执行期间不得被请求空闲超时误杀");
    await session.dispose();
  });
});

test("abort 取消：停止后不再触发请求超时；终态 aborted，且无 request.timeout 诊断", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      const engine = fake(async function* ({ options: config }) { yield assistantFrame([{ type: "text", text: "已开始" }]); await hang(config); });
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestFirstByteTimeoutMs: 10_000, requestIdleTimeoutMs: 10_000 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      const pending = session.prompt("abort 测试").then(() => undefined, (error: unknown) => error as Error);
      await delay(30);
      await session.abort!();
      const failure = await pending;
      assert.equal(failure?.name, "AbortError");
      const events = await eventsPromise;
      assert.equal((events.find((event) => event.kind === "settled")!.detail as { outcome?: unknown }).outcome, "aborted");
      const records = await diagnosticEvents(dir);
      assert.equal(records.filter((record) => record.event === "request.timeout").length, 0, "abort 清理期间停走：不得留下请求超时");
      await session.dispose();
    });
  });
});

test("SDK api_retry：诊断 attempt/max/delay/status/no_response + 角色日志一行；期间 ANS 不发第二次请求", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      const engine = fake(async function* () {
        yield apiRetryFrame({ attempt: 1, max_retries: 5, retry_delay_ms: 20, error_status: 529 });
        await delay(25);
        yield apiRetryFrame({ attempt: 2, max_retries: 5, retry_delay_ms: 40, error_status: null, no_response: { waited_ms: 1000, retry_wait_ms: 40 } });
        await delay(10);
        yield assistantFrame([{ type: "text", text: "重试后成功" }]);
      });
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestFirstByteTimeoutMs: 500, requestIdleTimeoutMs: 200 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      await session.prompt("api_retry 测试");
      const events = await eventsPromise;
      const retryLines = events.filter((event) => event.kind === "message" && (event.detail as { reasonCode?: unknown } | undefined)?.reasonCode === "claude-api-retry");
      assert.equal(retryLines.length, 2, "每条 api_retry 产生恰一行角色日志摘要");
      assert.match(retryLines[0]!.summary, /第 1\/5 次/);
      assert.ok(!/529|server_error|https?:|Bearer/i.test(retryLines[0]!.summary), "角色日志不泄露错误正文/URL/凭据");
      assert.equal(engine.users.length, 1, "SDK 重试期间 ANS 不得并发发起第二次请求");
      const records = await diagnosticEvents(dir);
      const retries = records.filter((record) => record.event === "request.sdk-retry");
      assert.equal(retries.length, 2);
      assert.equal(retries[0]!.attempt, 1);
      assert.equal(retries[0]!.count, 5);
      assert.equal(retries[0]!.durationMs, 20);
      assert.equal(retries[0]!.errorCode, "529");
      assert.equal(retries[1]!.errorCode, "no-response");
      assert.equal(retries[1]!.state, "no-response");
      assert.equal(retries[1]!.timeoutMs, 1000);
      const terminal = events.find((event) => event.kind === "settled")!;
      assert.equal((terminal.detail as { outcome?: unknown }).outcome, "completed");
      await session.dispose();
    });
  });
});
