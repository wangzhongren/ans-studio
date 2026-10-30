// test/测试/retry-safety-e2e.test.ts
// P3（2026-10-30 团队计划 §4.5 / 方案 v1.1 §4.3.3、§10 Q2/Q3/Q11；附录 B）：**replay-safe 同回合重试端到端**
// （编排 → Service → 真实 Claude 适配器）——
//  - 首字节前流失败（无文本/工具/客户交互）⇒ 自动重试至成功：`handle.send` 成功；事件流**恰一条**
//    `settled(completed)`（detail attempts=2/replaySafe=true）、**恰一个 handback**、无重复文本；
//  - 重试耗尽 ⇒ `handle.send` 失败（errorCode `MODEL_REQUEST_RETRY_EXHAUSTED`）；恰一条 `settled(failed)`、
//    人话短报、detail errorCode/attempts=3/replaySafe=true；恰一个 handback（status=failed，不声称完成）；
//  - 已输出文本后失败 ⇒ **不重试**（users=1）、failed、replaySafe=false 可见、无 request.retry；
//  - 诊断 request.retry（attempt/count/durationMs/errorCode/replayPlan）与 request.attempt.start 可复算；
//  - 项目目录零写入（临时夹具；不落 `.ans`）。
// 真实路径：真实 openRoleSession（编排+Service 组合）+ 真实 createClaudeRuntimeAdapter（仅 SDK 传输为假）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { after } from "node:test";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage, SDKUserMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import * as z from "zod";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";

import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-retry-safety-e2e-"));
after(() => {
  try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

const environment = { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: "fixture-api-secret" };

function writeAt(root: string, rel: string, text: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
}

/** 造一个最小项目（角色 A + 边界）；不在仓库留文件。 */
function projectFixture(): string {
  const root = mkdtempSync(join(ROOT, "proj-"));
  writeAt(root, "角色卡/A/role-card.md", "# 角色：A\n\nreplay-safe 重试 e2e 夹具角色。\n");
  writeAt(root, "角色卡/A/boundary.yaml", "role: A\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: fixture\n");
  return root;
}

const assistantFrame = (blocks: unknown[]): SDKMessage => ({
  type: "assistant",
  message: { id: "msg_fixture", type: "message", role: "assistant", model: "fixture", content: blocks, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
}) as unknown as SDKMessage;

type AttemptBehavior = { frames?: SDKMessage[]; hang?: boolean; fail?: boolean; throwError?: boolean };

/** 假 SDK 传输：按 attempt（query 创建序号）脚本化；无 MCP 工具；abort 时以 AbortError 退出。 */
function fakeSdk(script: (attemptIndex: number, options: Options) => AttemptBehavior) {
  const users: SDKUserMessage[] = [];
  let queryIndex = 0;
  const query = ({ prompt, options }: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => {
    assert.equal(typeof prompt, "object");
    const attemptIndex = queryIndex;
    queryIndex += 1;
    const opts = options!;
    const nativeId = opts.resume ?? randomUUID();
    const hang = () => new Promise<never>((_resolve, reject) => {
      const fail = () => reject(Object.assign(new Error("fixture abort"), { name: "AbortError" }));
      if (opts.abortController!.signal.aborted) return fail();
      opts.abortController!.signal.addEventListener("abort", fail, { once: true });
    });
    let closed = false;
    const generator = (async function* () {
      for await (const user of prompt as AsyncIterable<SDKUserMessage>) {
        users.push(user);
        // 与真实 CLI 一致：原生 prompt 经 UserPromptSubmit hook 确认轮次关联（适配器据此关闭 pendingInputs）。
        const content = user.message.content;
        const promptText = typeof content === "string" ? content
          : content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join("\n");
        await opts.hooks!.UserPromptSubmit![0]!.hooks[0]!({ hook_event_name: "UserPromptSubmit", prompt_id: user.uuid, prompt: promptText, session_id: "fixture", transcript_path: "fixture", cwd: opts.cwd! }, undefined, { signal: opts.abortController!.signal });
        const behavior = script(attemptIndex, opts);
        if (behavior.throwError) throw new Error("fixture stream down before first byte");
        for (const frame of behavior.frames ?? []) {
          if (closed) break;
          yield frame;
        }
        if (closed) break;
        if (behavior.hang) await hang();
        yield { type: "result", subtype: behavior.fail ? "error_during_execution" : "success", is_error: !!behavior.fail, session_id: nativeId, user_message_uuid: user.uuid } as SDKMessage;
      }
    })();
    return Object.assign(generator, {
      async interrupt() {},
      close() { closed = true; },
      async mcpServerStatus() { return []; },
    }) as unknown as Query;
  };
  return { users, dependencies: { env: environment, loadSdk: async () => ({ createSdkMcpServer, query }), loadZod: async () => z } };
}

async function withDiagnostics<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "ans-retry-safety-e2e-diag-"));
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

interface E2eResult {
  root: string;
  events: OrchestrationEvent[];
  failure?: Error & { code?: string; attempts?: number; replaySafe?: boolean };
  users: number;
  diagnostics: DiagRecord[];
}

/** 打开真实编排+Service+适配器，发一轮带必需回交的输入，收齐到 settled。 */
async function runRetryE2e(script: (attemptIndex: number, options: Options) => AttemptBehavior): Promise<E2eResult> {
  return withDiagnostics(async (diagDir) => {
    const root = projectFixture();
    const fake = fakeSdk(script);
    const listing = await listProject(root);
    const project = buildProjectConfig(listing, { accepted: true, source: "unit-test:retry-safety-e2e" });
    const handle = await openRoleSession(
      { roleId: "A", runtime: "claude", project, persistSession: false },
      {
        runtimeOptions: {
          providerFactories: { claude: (providerOptions) => createClaudeRuntimeAdapter(providerOptions, fake.dependencies) },
          requestFirstByteTimeoutMs: 500,
          requestIdleTimeoutMs: 500,
          requestRetryBaseMs: 10,
          requestAttemptMax: 3,
        },
      },
    );
    const events: OrchestrationEvent[] = [];
    const collector = (async () => {
      for await (const event of handle.events()) {
        events.push(event);
        if (event.kind === "settled") break;
      }
    })();
    const failure = await handle.send("replay-safe e2e", { handback: { required: true, taskId: "T-P3" } })
      .then(() => undefined, (error: unknown) => error as Error & { code?: string; attempts?: number; replaySafe?: boolean });
    await collector;
    await handle.dispose();
    assert.equal(existsSync(join(root, ".ans")), false, "重试回合不得写项目 .ans/（零项目写入）");
    return { root, events, failure, users: fake.users.length, diagnostics: await diagnosticEvents(diagDir) };
  });
}

const settledOf = (events: OrchestrationEvent[]): OrchestrationEvent[] => events.filter((event) => event.kind === "settled");
const handbacksOf = (events: OrchestrationEvent[]): OrchestrationEvent[] => events.filter((event) => event.kind === "handback");
const detailOf = (event: OrchestrationEvent): Record<string, unknown> => ((event as { detail?: unknown }).detail && typeof (event as { detail?: unknown }).detail === "object" ? (event as { detail: Record<string, unknown> }).detail : {});

test("e2e 首字节前流失败 ⇒ 自动重试至成功：恰一条 settled(completed)、恰一个 handback、不重复文本", async () => {
  const result = await runRetryE2e((attemptIndex) => attemptIndex === 0
    ? { throwError: true }
    : { frames: [assistantFrame([{ type: "text", text: "重试后成功" }])] });
  assert.equal(result.failure, undefined, "重试成功不得让 send 失败");
  const terminals = settledOf(result.events);
  assert.equal(terminals.length, 1, "整轮恰一条 settled（每次 attempt 不单独结算）");
  const terminal = terminals[0]!;
  assert.equal(terminal.summary, "会话结束");
  const detail = detailOf(terminal);
  assert.equal(detail.outcome, "completed");
  assert.equal(detail.attempts, 2, "attempts=2 如实透传到 Service 终态 detail");
  assert.equal(detail.replaySafe, true, "重试发生在无副作用阶段 ⇒ replaySafe=true");
  const handbacks = handbacksOf(result.events);
  assert.equal(handbacks.length, 1, "整轮恰一个 handback");
  assert.ok(["completed", "unreported"].includes(String((handbacks[0] as { handback?: { status?: unknown } }).handback?.status)), "成功回交不得标 failed");
  const promptInputs = result.events.filter((event) => event.kind === "message" && (event.detail as { source?: unknown } | undefined)?.source === "prompt-input");
  assert.equal(promptInputs.length, 1, "重试不新增 prompt-input 行/用户消息");
  const texts = result.events.filter((event) => event.kind === "message" && event.summary === "重试后成功");
  assert.equal(texts.length, 1, "成功文本不得重复");
  const retryLines = result.events.filter((event) => event.kind === "message" && (event.detail as { reasonCode?: unknown } | undefined)?.reasonCode === "claude-request-retry");
  assert.equal(retryLines.length, 1, "UI/角色日志如实显示一次重试");
  assert.match(retryLines[0]!.summary, /第 2\/3 次/);
  assert.equal(result.users, 2, "每次 attempt 以同一输入重开一次");
  const retries = result.diagnostics.filter((record) => record.event === "request.retry");
  assert.equal(retries.length, 1);
  assert.equal(retries[0]!.attempt, 2);
  assert.equal(retries[0]!.count, 3);
  assert.equal(retries[0]!.durationMs, 10);
  assert.equal(retries[0]!.errorCode, "MODEL_REQUEST_FAILED");
  assert.equal(retries[0]!.replayPlan, "safe");
  assert.equal(result.diagnostics.filter((record) => record.event === "request.attempt.start").length, 2);
});

test("e2e 重试耗尽：failed + MODEL_REQUEST_RETRY_EXHAUSTED、恰一条 settled、人话短报、恰一个 failed handback", async () => {
  const result = await runRetryE2e(() => ({ throwError: true }));
  assert.ok(result.failure, "重试耗尽必须让 send 失败（不得伪造成功）");
  assert.equal(result.failure!.code, "MODEL_REQUEST_RETRY_EXHAUSTED");
  assert.equal(result.failure!.attempts, 3);
  assert.equal(result.failure!.replaySafe, true);
  const terminals = settledOf(result.events);
  assert.equal(terminals.length, 1, "恰一条 settled");
  const terminal = terminals[0]!;
  assert.equal(terminal.summary, "本轮自动重试仍未成功，已结束。", "短报为人话，不含技术 code");
  const detail = detailOf(terminal);
  assert.equal(detail.outcome, "failed");
  assert.equal(detail.errorCode, "MODEL_REQUEST_RETRY_EXHAUSTED");
  assert.equal(detail.attempts, 3);
  assert.equal(detail.replaySafe, true);
  const handbacks = handbacksOf(result.events);
  assert.equal(handbacks.length, 1, "恰一个 handback（无额外回交）");
  const handback = (handbacks[0] as { handback?: { status?: unknown; summary?: unknown } }).handback;
  assert.equal(handback?.status, "failed");
  assert.match(String(handback?.summary ?? ""), /尚不能确认任务完成/, "失败回交不得声称完成");
  assert.equal(result.events.filter((event) => event.kind === "message" && (event.detail as { source?: unknown } | undefined)?.source === "prompt-input").length, 1);
  assert.equal(result.users, 3, "最多 3 attempts（首次 + 2 次重试）");
  const retries = result.diagnostics.filter((record) => record.event === "request.retry");
  assert.deepEqual(retries.map((record) => record.attempt), [2, 3]);
  assert.deepEqual(retries.map((record) => record.durationMs), [10, 20], "退避 1x/2x（默认 1s/2s 级别）");
  const failed = result.diagnostics.find((record) => record.event === "request.failed");
  assert.equal(failed?.errorCode, "MODEL_REQUEST_RETRY_EXHAUSTED");
  assert.equal(failed?.attempt, 3);
  assert.equal(failed?.replayPlan, "safe");
});

test("e2e 已输出文本后空闲超时 ⇒ 不重试：failed、attempts=1、replaySafe=false、无 request.retry", async () => {
  const result = await runRetryE2e((attemptIndex) => attemptIndex === 0
    ? { frames: [assistantFrame([{ type: "text", text: "先输出一段" }])], hang: true }
    : { frames: [assistantFrame([{ type: "text", text: "不应到达" }])] });
  assert.ok(result.failure, "不安全的请求失败必须如实结束");
  assert.equal(result.failure!.code, "request-timeout-idle");
  assert.equal(result.failure!.attempts, 1, "已输出文本后绝不重试");
  assert.equal(result.failure!.replaySafe, false);
  const terminals = settledOf(result.events);
  assert.equal(terminals.length, 1, "恰一条 settled");
  const terminal = terminals[0]!;
  assert.equal(terminal.summary, "本轮请求超时（响应空闲超时）");
  const detail = detailOf(terminal);
  assert.equal(detail.outcome, "failed");
  assert.equal(detail.errorCode, "request-timeout-idle");
  assert.equal(detail.attempts, 1);
  assert.equal(detail.replaySafe, false, "已输出文本 ⇒ replaySafe=false 可见");
  assert.equal(detail.timeoutKind, "idle");
  assert.equal(handbacksOf(result.events).length, 1, "失败恰一个 handback");
  assert.equal(result.users, 1, "有副作用后绝不重放");
  assert.equal(result.events.filter((event) => event.kind === "message" && event.summary === "不应到达").length, 0, "不得出现第二次尝试的输出");
  assert.equal(result.diagnostics.filter((record) => record.event === "request.retry").length, 0, "不安全不得写 request.retry");
});
