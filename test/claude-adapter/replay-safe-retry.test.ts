// test/claude-adapter/replay-safe-retry.test.ts
// P3（2026-10-30 团队计划 §4.5 / 方案 v1.1 §4.3.3、§10 Q2/Q3/Q11；附录 B）：**仅 replay-safe 的同回合安全重试**——
//  - 首字节前流失败（无文本/thinking/工具/客户交互）⇒ 自动重试至成功：attempts=2、恰一条 settled(completed)，
//    不重复文本/工具；诊断 request.retry（attempt/count/durationMs/errorCode/replayPlan）齐全；
//  - 重试耗尽 ⇒ 恰一条 settled(failed)、errorCode `MODEL_REQUEST_RETRY_EXHAUSTED`、attempts=3，人话短报由
//    Service 层（e2e）验证；本文件验证适配器事实；
//  - 已输出文本 / 已调用工具 / 客户交互已出现 ⇒ **不重试**（replaySafe=false 可见）；
//  - 退避期间 abort ⇒ 立即终止、不再发起 attempt、终态 aborted；
//  - 离线 ⇒ 不发起重试（走 P2 路径），失败如实；
//  - SDK `api_retry` 期间 ANS 不并发另起重试（任一时刻只有一个 query 打开）。
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
import { createNetworkGate } from "../../src/common/runtime-core/network-gate.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { RuntimeProviderOptions, InteractionGate, ToolDefinition, SessionEvent } from "../../src/model/runtime.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

const role: ResolvedRole = { id: "claude-replay-safe-retry", kind: "project", cardText: "# fixture", boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
const environment = { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: "fixture-api-secret" };
const assistantFrame = (blocks: unknown[]): SDKMessage => ({
  type: "assistant",
  message: { id: "msg_fixture", type: "message", role: "assistant", model: "fixture", content: blocks, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
}) as unknown as SDKMessage;
const apiRetryFrame = (fields: { attempt: number; max_retries: number; retry_delay_ms: number; error_status: number | null }): SDKMessage => ({
  type: "system", subtype: "api_retry", error: "server_error", uuid: randomUUID(), session_id: "fixture", ...fields,
}) as unknown as SDKMessage;

type ScriptContext = { client: Client; options: Options; user: SDKUserMessage };
type Script = (ctx: ScriptContext) => AsyncGenerator<SDKMessage, void, unknown>;

/** 假 SDK 传输：真实 MCP 注册/PreToolUse/工具 handler；只有 query 是假的（与 request-timeout.test.ts 同口径）。 */
function fake(script: Script) {
  const configurations: Options[] = [];
  const users: SDKUserMessage[] = [];
  let openQueries = 0;
  let maxConcurrentQueries = 0;
  const query = ({ prompt, options }: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => {
    assert.equal(typeof prompt, "object");
    const opts = options!;
    configurations.push(opts);
    openQueries += 1;
    maxConcurrentQueries = Math.max(maxConcurrentQueries, openQueries);
    const client = new Client({ name: "replay-safe-retry-fixture", version: "1.0.0" });
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
      close() {
        if (!closed) { closed = true; openQueries -= 1; }
        void connected.then(() => client.close()).catch(() => {});
      },
      async mcpServerStatus() { return []; },
    }) as unknown as Query;
  };
  return {
    configurations,
    users,
    get maxConcurrentQueries() { return maxConcurrentQueries; },
    dependencies: { env: environment, loadSdk: async () => ({ createSdkMcpServer, query }), loadZod: async () => z },
  };
}

/** 永不返回（空闲/首字节挂起）；request abort 时以 AbortError 退出，避免测试留下悬挂生产者。 */
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

const probeTool = (): ToolDefinition => ({
  name: "probe", description: "fixture", inputSchema: { type: "object", properties: {} },
  handler: async () => ({ ok: true, message: "probe done" }),
});

const options = (root: string, tools: readonly ToolDefinition[], overrides: Partial<RuntimeProviderOptions> = {}): RuntimeProviderOptions => ({
  runtime: "claude", projectRoot: root, skillRoot: root, tools, interactionGate: gate(), currentTurnId: () => undefined,
  requestFirstByteTimeoutMs: 5_000, requestIdleTimeoutMs: 5_000,
  requestRetryBaseMs: 20, requestAttemptMax: 3, ...overrides,
});

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ans-claude-replay-safe-retry-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function collect(session: { events(): AsyncIterable<SessionEvent> }): Promise<SessionEvent[]> {
  const output: SessionEvent[] = [];
  for await (const event of session.events()) {
    output.push(event);
    if (event.kind === "settled") return output;
  }
  return output;
}

async function withDiagnostics<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "ans-replay-safe-retry-diag-"));
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

const settledEvents = (events: SessionEvent[]): SessionEvent[] => events.filter((event) => event.kind === "settled");
const detailOf = (event: SessionEvent): Record<string, unknown> => (event.detail && typeof event.detail === "object" ? event.detail as Record<string, unknown> : {});

test("首字节前流失败（replaySafe）⇒ 自动重试至成功：attempts=2、恰一条 settled(completed)、不重复文本", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      let calls = 0;
      const engine = fake(async function* () {
        calls += 1;
        if (calls === 1) throw new Error("fixture socket hang up before first byte");
        yield assistantFrame([{ type: "text", text: "重试后成功" }]);
      });
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestRetryBaseMs: 20 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      await session.prompt("replay-safe 成功测试");
      const events = await eventsPromise;
      const terminals = settledEvents(events);
      assert.equal(terminals.length, 1, "整轮恰一条 settled（每次 attempt 不单独结算）");
      const detail = detailOf(terminals[0]!);
      assert.equal(detail.outcome, "completed");
      assert.equal(detail.attempts, 2, "首次失败 + 重试成功 ⇒ attempts=2");
      assert.equal(detail.replaySafe, true, "无文本/工具/客户交互 ⇒ replaySafe=true");
      assert.equal(events.filter((event) => event.kind === "message" && event.summary === "重试后成功").length, 1, "成功文本不得重复");
      assert.equal(engine.users.length, 2, "每次 attempt 以同一输入重开一次（无额外用户消息）");
      assert.equal(engine.configurations.length, 2, "重试关闭旧 query 后新建 query");
      assert.equal(engine.maxConcurrentQueries, 1, "旧 query 关闭后才新建，任一时刻只有一个 query");
      const retryLines = events.filter((event) => event.kind === "message" && (event.detail as { reasonCode?: unknown } | undefined)?.reasonCode === "claude-request-retry");
      assert.equal(retryLines.length, 1, "重试恰一行角色日志");
      assert.match(retryLines[0]!.summary, /第 2\/3 次/);
      assert.ok(!/https?:|Bearer|fixture socket|MODEL_REQUEST/i.test(retryLines[0]!.summary), "角色日志不泄露错误正文/URL/凭据/技术 code");
      const records = await diagnosticEvents(dir);
      const retries = records.filter((record) => record.event === "request.retry");
      assert.equal(retries.length, 1, "每次重试恰一条 request.retry 诊断");
      assert.equal(retries[0]!.attempt, 2);
      assert.equal(retries[0]!.count, 3, "max 经既有白名单 count 字段承载");
      assert.equal(retries[0]!.durationMs, 20, "退避 delay 经既有白名单 durationMs 字段承载");
      assert.equal(retries[0]!.errorCode, "MODEL_REQUEST_FAILED");
      assert.equal(retries[0]!.replayPlan, "safe");
      assert.equal(records.filter((record) => record.event === "request.failed").length, 0, "成功重试不写 request.failed");
      assert.equal(records.filter((record) => record.event === "request.attempt.start").length, 2, "两次 attempt.start");
      await session.dispose();
    });
  });
});

test("重试耗尽：3 attempts 后退避 10/20ms ⇒ failed + MODEL_REQUEST_RETRY_EXHAUSTED、恰一条 settled、无额外 attempt", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      const engine = fake(async function* () { throw new Error("fixture stream down"); });
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestRetryBaseMs: 10 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      const failure = await session.prompt("耗尽测试").then(() => undefined, (error: unknown) => error as Error & { code?: string; attempts?: number; replaySafe?: boolean });
      assert.ok(failure, "重试耗尽必须失败，不得伪造成功");
      assert.equal(failure!.code, "MODEL_REQUEST_RETRY_EXHAUSTED");
      assert.equal(failure!.attempts, 3);
      assert.equal(failure!.replaySafe, true);
      const events = await eventsPromise;
      const terminals = settledEvents(events);
      assert.equal(terminals.length, 1, "整轮恰一条 settled");
      const detail = detailOf(terminals[0]!);
      assert.equal(detail.outcome, "failed");
      // 适配器的 settled.detail 不承载 errorCode（由 Service 从错误上抛事实写入终态 detail）；
      // 这里核对适配器事实：attempts/replaySafe 与恰好一条 settled。
      assert.equal(detail.attempts, 3);
      assert.equal(detail.replaySafe, true);
      assert.equal(engine.users.length, 3, "最多 3 attempts（首次 + 2 次重试）");
      assert.equal(engine.configurations.length, 3);
      assert.equal(engine.maxConcurrentQueries, 1);
      const records = await diagnosticEvents(dir);
      const retries = records.filter((record) => record.event === "request.retry");
      assert.equal(retries.length, 2);
      assert.deepEqual(retries.map((record) => record.attempt), [2, 3]);
      assert.deepEqual(retries.map((record) => record.durationMs), [10, 20], "指数退避 1x/2x（默认 1s/2s 级别）");
      const failed = records.find((record) => record.event === "request.failed");
      assert.equal(failed?.errorCode, "MODEL_REQUEST_RETRY_EXHAUSTED");
      assert.equal(failed?.attempt, 3);
      assert.equal(failed?.replayPlan, "safe");
      await session.dispose();
    });
  });
});

test("重试预算耗尽（非 attempts）⇒ 不重试、failed + MODEL_REQUEST_RETRY_EXHAUSTED、attempts=1", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      const engine = fake(async function* ({ options: config }) { await hang(config); });
      // 首字节 40ms 失败时预算（10ms）已用完：不得再发起重试；如实标重试耗尽。
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestFirstByteTimeoutMs: 40, requestIdleTimeoutMs: 10_000, requestRetryBaseMs: 10, requestRetryBudgetMs: 10 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      const failure = await session.prompt("预算耗尽测试").then(() => undefined, (error: unknown) => error as Error & { code?: string; attempts?: number; replaySafe?: boolean });
      assert.equal(failure?.code, "MODEL_REQUEST_RETRY_EXHAUSTED");
      assert.equal(failure?.attempts, 1);
      assert.equal(failure?.replaySafe, true);
      const events = await eventsPromise;
      assert.equal(settledEvents(events).length, 1);
      assert.equal(detailOf(settledEvents(events)[0]!).outcome, "failed");
      assert.equal(engine.users.length, 1, "预算耗尽不得发起第二次 attempt");
      assert.equal(engine.configurations.length, 1);
      const records = await diagnosticEvents(dir);
      assert.equal(records.filter((record) => record.event === "request.retry").length, 0);
      const failed = records.find((record) => record.event === "request.failed");
      assert.equal(failed?.errorCode, "MODEL_REQUEST_RETRY_EXHAUSTED");
      assert.equal(failed?.attempt, 1);
      await session.dispose();
    });
  });
});

test("已输出文本后失败 ⇒ 不重试：failed、attempts=1、replaySafe=false、无 request.retry", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      const engine = fake(async function* ({ options: config }) {
        yield assistantFrame([{ type: "text", text: "已经开始输出" }]);
        await hang(config);
      });
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestFirstByteTimeoutMs: 500, requestIdleTimeoutMs: 40, requestRetryBaseMs: 10 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      const failure = await session.prompt("文本后失败").then(() => undefined, (error: unknown) => error as Error & { code?: string; attempts?: number; replaySafe?: boolean });
      assert.equal(failure?.code, "request-timeout-idle");
      assert.equal(failure?.attempts, 1);
      assert.equal(failure?.replaySafe, false);
      const events = await eventsPromise;
      assert.equal(settledEvents(events).length, 1);
      const detail = detailOf(settledEvents(events)[0]!);
      assert.equal(detail.outcome, "failed");
      assert.equal(detail.replaySafe, false, "已输出文本 ⇒ replaySafe=false 可见");
      assert.equal(engine.users.length, 1, "有副作用后绝不重放");
      assert.equal(engine.configurations.length, 1);
      const records = await diagnosticEvents(dir);
      assert.equal(records.filter((record) => record.event === "request.retry").length, 0, "不安全不得写 request.retry");
      await session.dispose();
    });
  });
});

test("已调用工具后失败 ⇒ 不重试：工具副作用零复放、attempts=1、replaySafe=false", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      const engine = fake(async function* ({ client }) {
        yield assistantFrame([{ type: "tool_use", id: "tu-1", name: "mcp__ans__probe", input: {} }]);
        const result = await client.callTool({ name: "probe", arguments: {} });
        assert.ok(!(result as { isError?: boolean }).isError, "probe 工具应成功（真实 MCP 注册路径）");
        throw new Error("fixture stream down after tool");
      });
      const session = await createClaudeRuntimeAdapter(options(root, [probeTool()], { requestRetryBaseMs: 10 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      const failure = await session.prompt("工具后失败").then(() => undefined, (error: unknown) => error as Error & { code?: string; attempts?: number; replaySafe?: boolean });
      assert.equal(failure?.code, "MODEL_REQUEST_FAILED");
      assert.equal(failure?.attempts, 1);
      assert.equal(failure?.replaySafe, false);
      const events = await eventsPromise;
      assert.equal(settledEvents(events).length, 1);
      assert.equal(detailOf(settledEvents(events)[0]!).replaySafe, false);
      const toolStarts = events.filter((event) => event.kind === "tool_call");
      assert.equal(toolStarts.length, 1, "工具开始事件不得复放");
      assert.equal(engine.users.length, 1);
      assert.equal(engine.configurations.length, 1);
      const records = await diagnosticEvents(dir);
      assert.equal(records.filter((record) => record.event === "request.retry").length, 0);
      await session.dispose();
    });
  });
});

test("客户交互已出现后失败 ⇒ 不重试（运行时状态门槛，非模型自报）", async () => {
  await fixture(async (root) => {
    const interactionGate = gate();
    interactionGate.begin();
    const engine = fake(async function* () { throw new Error("fixture stream down during interaction"); });
    const session = await createClaudeRuntimeAdapter(options(root, [], { requestRetryBaseMs: 10, interactionGate }), engine.dependencies).bindRole(role);
    const eventsPromise = collect(session);
    const failure = await session.prompt("交互后失败").then(() => undefined, (error: unknown) => error as Error & { code?: string; attempts?: number; replaySafe?: boolean });
    interactionGate.end();
    assert.equal(failure?.code, "MODEL_REQUEST_FAILED");
    assert.equal(failure?.attempts, 1);
    assert.equal(failure?.replaySafe, false);
    assert.equal(settledEvents(await eventsPromise).length, 1);
    assert.equal(engine.users.length, 1, "客户交互出现后绝不重放");
    await session.dispose();
  });
});

test("退避期间取消/abort ⇒ 立即终止、不再发起 attempt、终态 aborted", async () => {
  await fixture(async (root) => {
    const engine = fake(async function* () { throw new Error("fixture stream down"); });
    const session = await createClaudeRuntimeAdapter(options(root, [], { requestRetryBaseMs: 5_000 }), engine.dependencies).bindRole(role);
    const eventsPromise = collect(session);
    const pending = session.prompt("退避取消").then(() => undefined, (error: unknown) => error as Error);
    await delay(120); // 首次失败已发生、正处 5s 退避窗口
    const started = Date.now();
    await session.abort!();
    const failure = await pending;
    const elapsed = Date.now() - started;
    assert.equal(failure?.name, "AbortError");
    assert.ok(elapsed < 1_000, `abort 应立即生效（实测 ${elapsed}ms），不等待退避结束`);
    const events = await eventsPromise;
    const terminals = settledEvents(events);
    assert.equal(terminals.length, 1);
    assert.equal(detailOf(terminals[0]!).outcome, "aborted");
    assert.equal(engine.users.length, 1, "取消后不得再发起 attempt");
    assert.equal(engine.configurations.length, 1);
    await session.dispose();
  });
});

test("离线期间失败 ⇒ 不发起重试（走 P2 路径）、replaySafe 可见、无 request.retry", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      const networkGate = createNetworkGate();
      networkGate.apply({ online: false, source: "main-net", at: Date.now(), stableForMs: 0, reason: "interface-down" });
      const engine = fake(async function* () { throw new Error("fixture stream down while offline"); });
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestRetryBaseMs: 10, networkGate, networkRetryWindowMs: 60_000 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      const failure = await session.prompt("离线失败").then(() => undefined, (error: unknown) => error as Error & { code?: string; attempts?: number; replaySafe?: boolean });
      assert.equal(failure?.code, "MODEL_REQUEST_FAILED", "离线失败不改为重试耗尽；P2 的窗口终态仍由 network-offline-timeout 负责");
      assert.equal(failure?.attempts, 1);
      assert.equal(failure?.replaySafe, true);
      const events = await eventsPromise;
      assert.equal(settledEvents(events).length, 1);
      assert.equal(engine.users.length, 1, "离线期间不发起重试");
      assert.equal(engine.configurations.length, 1);
      const records = await diagnosticEvents(dir);
      assert.equal(records.filter((record) => record.event === "request.retry").length, 0);
      assert.ok(records.some((record) => record.event === "network.request.pause"), "离线暂停诊断仍可见（P2 路径）");
      await session.dispose();
    });
  });
});

test("SDK api_retry 期间 ANS 不并发重试；SDK 最终失败后才 replay-safe 重开", async () => {
  await withDiagnostics(async (dir) => {
    await fixture(async (root) => {
      let calls = 0;
      const engine = fake(async function* () {
        calls += 1;
        if (calls === 1) {
          yield apiRetryFrame({ attempt: 1, max_retries: 5, retry_delay_ms: 20, error_status: 529 });
          await delay(20);
          throw new Error("fixture stream down after sdk retries");
        }
        yield assistantFrame([{ type: "text", text: "SDK 重试后 ANS 重试成功" }]);
      });
      const session = await createClaudeRuntimeAdapter(options(root, [], { requestRetryBaseMs: 10 }), engine.dependencies).bindRole(role);
      const eventsPromise = collect(session);
      await session.prompt("SDK 重试并发测试");
      const events = await eventsPromise;
      assert.equal(settledEvents(events).length, 1);
      assert.equal(detailOf(settledEvents(events)[0]!).outcome, "completed");
      assert.equal(detailOf(settledEvents(events)[0]!).attempts, 2);
      assert.equal(engine.maxConcurrentQueries, 1, "SDK 重试期间/之后 ANS 都未并发打开第二个 query");
      assert.equal(engine.users.length, 2);
      const records = await diagnosticEvents(dir);
      assert.equal(records.filter((record) => record.event === "request.retry").length, 1);
      assert.ok(records.some((record) => record.event === "request.sdk-retry" && record.attempt === 1), "SDK 重试诊断仍可见");
      await session.dispose();
    });
  });
});
